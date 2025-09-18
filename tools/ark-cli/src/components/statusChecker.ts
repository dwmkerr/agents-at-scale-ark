import {exec} from 'child_process';
import {promisify} from 'util';
import {
  DependencyStatus,
  ServiceStatus,
  StatusData,
  CommandVersionConfig,
} from '../lib/types.js';
import {KubernetesConfigManager} from '../lib/kubernetes.js';
import * as k8s from '@kubernetes/client-node';
import {isCommandAvailable} from '../lib/commandUtils.js';
import {arkServices} from '../arkServices.js';
import {isArkReady} from '../lib/arkStatus.js';

const execAsync = promisify(exec);

export const getNodeVersion = (): CommandVersionConfig => ({
  command: 'node',
  versionArgs: '--version',
  versionExtract: (output: string) => output.trim(),
});

export const getNpmVersion = (): CommandVersionConfig => ({
  command: 'npm',
  versionArgs: '--version',
  versionExtract: (output: string) => output.trim(),
});

export const getKubectlVersion = (): CommandVersionConfig => ({
  command: 'kubectl',
  versionArgs: 'version --client --output=json',
  versionExtract: (output: string) => {
    try {
      const versionInfo = JSON.parse(output);
      if (versionInfo.clientVersion) {
        return `v${versionInfo.clientVersion.major}.${versionInfo.clientVersion.minor}`;
      }
      throw new Error('kubectl version output missing clientVersion field');
    } catch (e) {
      throw new Error(
        `Failed to parse kubectl version JSON: ${e instanceof Error ? e.message : 'Unknown error'}`
      );
    }
  },
});

export const getDockerVersion = (): CommandVersionConfig => ({
  command: 'docker',
  versionArgs: '--version',
  versionExtract: (output: string) => output.trim(),
});

export const getHelmVersion = (): CommandVersionConfig => ({
  command: 'helm',
  versionArgs: 'version --short',
  versionExtract: (output: string) => output.trim(),
});

export const getMinikubeVersion = (): CommandVersionConfig => ({
  command: 'minikube',
  versionArgs: 'version --short',
  versionExtract: (output: string) => output.trim(),
});

export const getKindVersion = (): CommandVersionConfig => ({
  command: 'kind',
  versionArgs: 'version',
  versionExtract: (output: string) => {
    // kind version output is like "kind v0.20.0 go1.21.0 linux/amd64"
    const match = output.match(/kind (v[\d.]+)/);
    return match ? match[1] : output.trim();
  },
});

function createErrorServiceStatus(
  name: string,
  url: string,
  error: unknown,
  defaultStatus: 'unhealthy' | 'not installed' = 'unhealthy',
  defaultDetails?: string
): ServiceStatus {
  const errorMessage =
    error instanceof Error ? error.message : 'Unknown error occurred';
  return {
    name,
    status: defaultStatus,
    url,
    details: defaultDetails || `Error: ${errorMessage}`,
  };
}

export class StatusChecker {
  private kubernetesManager: KubernetesConfigManager;

  constructor() {
    this.kubernetesManager = new KubernetesConfigManager();
  }

  /**
   * Get version of a command
   */
  private async getCommandVersion(
    config: CommandVersionConfig
  ): Promise<string> {
    try {
      const cmd = `${config.command} ${config.versionArgs}`;
      const {stdout} = await execAsync(cmd);
      return config.versionExtract(stdout);
    } catch (error) {
      throw new Error(
        `Failed to get ${config.command} version: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check deployment status
   */
  private async checkDeploymentStatus(
    serviceName: string,
    deploymentName: string,
    namespace: string
  ): Promise<ServiceStatus> {
    try {
      const cmd = `kubectl get deployment ${deploymentName} --namespace ${namespace} -o json`;
      const {stdout} = await execAsync(cmd);
      const deployment = JSON.parse(stdout);

      const replicas = deployment.spec?.replicas || 0;
      const readyReplicas = deployment.status?.readyReplicas || 0;
      const availableReplicas = deployment.status?.availableReplicas || 0;

      // Check Kubernetes 'Available' condition - only 'available' deployments are healthy
      const availableCondition = deployment.status?.conditions?.find(
        (condition: any) => condition.type === 'Available'
      );
      const isAvailable = availableCondition?.status === 'True';
      const allReplicasReady =
        readyReplicas === replicas && availableReplicas === replicas;

      // Determine status: not ready if 0 replicas, healthy if available and all ready, warning otherwise
      let status: 'healthy' | 'warning' | 'not ready';
      if (replicas === 0 || readyReplicas === 0) {
        status = 'not ready';
      } else if (isAvailable && allReplicasReady) {
        status = 'healthy';
      } else {
        status = 'warning';
      }

      return {
        name: serviceName,
        status,
        details: `${readyReplicas}/${replicas} replicas ready`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('not found')) {
        return {
          name: serviceName,
          status: 'not installed',
          details: `Deployment '${deploymentName}' not found in namespace '${namespace}'`,
        };
      }

      return createErrorServiceStatus(
        serviceName,
        '',
        error,
        'unhealthy',
        `Failed to check deployment: ${errorMessage}`
      );
    }
  }

  /**
   * Check helm release status (fallback for services without deployments)
   */
  private async checkHelmStatus(
    serviceName: string,
    helmReleaseName: string,
    namespace: string
  ): Promise<ServiceStatus> {
    try {
      const cmd = `helm list --filter ${helmReleaseName} --namespace ${namespace} --output json`;
      const {stdout} = await execAsync(cmd);
      const helmList = JSON.parse(stdout);

      if (helmList.length === 0) {
        return {
          name: serviceName,
          status: 'not installed',
          details: `Helm release '${helmReleaseName}' not found in namespace '${namespace}'`,
        };
      }

      const release = helmList[0];
      const status = release.status?.toLowerCase() || 'unknown';
      const revision = release.revision || 'unknown';
      const appVersion = release.app_version || 'unknown';

      const isHealthy = status === 'deployed';

      return {
        name: serviceName,
        status: isHealthy ? 'healthy' : 'unhealthy',
        version: appVersion,
        revision: revision,
        details: `Status: ${status}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return createErrorServiceStatus(
        serviceName,
        '',
        error,
        'unhealthy',
        `Failed to check helm status: ${errorMessage}`
      );
    }
  }

  /**
   * Return a "not installed" status for a service
   */
  private createNotInstalledStatus(serviceName: string): ServiceStatus {
    return {
      name: serviceName,
      status: 'not installed',
      details: `${serviceName} is not configured or not part of this deployment`,
    };
  }

  /**
   * Check Kubernetes service health via pods and endpoints
   */
  private async checkKubernetesService(
    serviceName: string,
    kubernetesServiceName: string,
    namespace: string = 'default'
  ): Promise<ServiceStatus> {
    try {
      await this.kubernetesManager.initializeConfig();
      const kc = this.kubernetesManager.getKubeConfig();
      const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

      // Check if service exists and has endpoints
      const service = await k8sApi.readNamespacedService({
        name: kubernetesServiceName,
        namespace,
      });

      const endpoints = await k8sApi.readNamespacedEndpoints({
        name: kubernetesServiceName,
        namespace,
      });

      // Check if service has ready endpoints
      const readyAddresses =
        endpoints.subsets?.reduce((total, subset) => {
          return total + (subset.addresses?.length || 0);
        }, 0) || 0;

      if (readyAddresses > 0) {
        const serviceIP = service.spec?.clusterIP;
        const servicePort = service.spec?.ports?.[0]?.port;

        return {
          name: serviceName,
          status: 'healthy',
          url: `cluster://${serviceIP}:${servicePort}`,
          details: `${serviceName} running in cluster (${readyAddresses} ready endpoints)`,
        };
      } else {
        return {
          name: serviceName,
          status: 'unhealthy',
          details: `${serviceName} service exists but has no ready endpoints`,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // If service not found, it's not installed
      if (errorMessage.includes('not found')) {
        return this.createNotInstalledStatus(serviceName);
      }

      // Other errors indicate unhealthy
      return {
        name: serviceName,
        status: 'unhealthy',
        details: `Failed to check ${serviceName}: ${errorMessage}`,
      };
    }
  }

  /**
   * Check system dependencies
   */
  private async checkDependencies(): Promise<DependencyStatus[]> {
    const dependencies = [
      {name: 'node', ...getNodeVersion()},
      {name: 'npm', ...getNpmVersion()},
      {name: 'kubectl', ...getKubectlVersion()},
      {name: 'docker', ...getDockerVersion()},
      {name: 'helm', ...getHelmVersion()},
      {name: 'minikube', ...getMinikubeVersion()},
      {name: 'kind', ...getKindVersion()},
    ];

    const results: DependencyStatus[] = [];

    for (const dep of dependencies) {
      const installed = await isCommandAvailable(dep.command);
      const version = installed
        ? await this.getCommandVersion({
            command: dep.command,
            versionArgs: dep.versionArgs,
            versionExtract: dep.versionExtract,
          })
        : undefined;
      results.push({
        name: dep.name,
        installed,
        version,
        details: installed
          ? `Found ${dep.name} ${version}`
          : `${dep.name} not found in PATH`,
      });
    }
    return results;
  }

  /**
   * Run all checks and return results
   */
  public async checkAll(): Promise<
    StatusData & {clusterAccess: boolean; clusterInfo?: any}
  > {
    // Check dependencies first
    const dependencies = await this.checkDependencies();

    // Test cluster access
    const configManager = new (await import('../config.js')).ConfigManager();
    const clusterAccess = await configManager.testClusterAccess();

    // Get cluster info if accessible
    let clusterInfo;
    if (clusterAccess) {
      const {getClusterInfo} = await import('../lib/cluster.js');
      clusterInfo = await getClusterInfo();
    }

    let services: ServiceStatus[] = [];

    // Only check ARK services if we have cluster access
    if (clusterAccess) {
      const serviceChecks: Promise<ServiceStatus>[] = [];

      for (const [serviceName, service] of Object.entries(arkServices)) {
        if (service.k8sDeploymentName) {
          serviceChecks.push(
            this.checkDeploymentStatus(
              serviceName,
              service.k8sDeploymentName,
              service.namespace
            )
          );
        } else {
          serviceChecks.push(
            this.checkHelmStatus(
              serviceName,
              service.helmReleaseName,
              service.namespace
            )
          );
        }
      }

      services = await Promise.all(serviceChecks);
    }

    // Check if ARK is ready (controller is running)
    let arkReady = false;
    let defaultModelExists = false;

    if (clusterAccess) {
      arkReady = await isArkReady();

      // Check for default model
      if (arkReady) {
        try {
          await execAsync('kubectl get model default -o name');
          defaultModelExists = true;
        } catch {
          defaultModelExists = false;
        }
      }
    }

    return {
      services,
      dependencies,
      clusterAccess,
      clusterInfo,
      arkReady,
      defaultModelExists,
    };
  }
}
