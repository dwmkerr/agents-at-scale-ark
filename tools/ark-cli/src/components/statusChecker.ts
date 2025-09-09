import { exec } from 'child_process';
import { promisify } from 'util';
import {
  DependencyStatus,
  ServiceStatus,
  StatusData,
  CommandVersionConfig,
} from '../lib/types.js';
import { KubernetesConfigManager } from '../lib/kubernetes.js';
import * as k8s from '@kubernetes/client-node';
import axios from 'axios';
import { ArkClient } from '../lib/arkClient.js';
import { isCommandAvailable } from '../lib/commandUtils.js';

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
  private arkClient: ArkClient;
  private kubernetesManager: KubernetesConfigManager;

  constructor(arkClient: ArkClient) {
    this.arkClient = arkClient;
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
      const { stdout } = await execAsync(cmd);
      return config.versionExtract(stdout);
    } catch (error) {
      throw new Error(
        `Failed to get ${config.command} version: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check health of a service by URL
   */
  private async checkServiceHealth(
    serviceName: string,
    serviceUrl: string,
    successMessage: string,
    healthPath: string = ''
  ): Promise<ServiceStatus> {
    const fullUrl = `${serviceUrl}${healthPath}`;

    try {
      await axios.get(fullUrl, { timeout: 5000 });
      return {
        name: serviceName,
        status: 'healthy',
        url: serviceUrl,
        details: successMessage,
      };
    } catch (error) {
      return createErrorServiceStatus(
        serviceName,
        serviceUrl,
        error,
        'unhealthy',
        `${serviceName} is not running or not accessible`
      );
    }
  }

  /**
   * Check if ark-api is running and healthy
   */
  private async checkArkApi(customUrl?: string): Promise<ServiceStatus> {
    const url = customUrl || this.arkClient.getBaseURL();
    return this.checkServiceHealth(
      'ark-api',
      url,
      'ARK API is running',
      '/health'
    );
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
      { name: 'node', ...getNodeVersion() },
      { name: 'npm', ...getNpmVersion() },
      { name: 'kubectl', ...getKubectlVersion() },
      { name: 'docker', ...getDockerVersion() },
      { name: 'helm', ...getHelmVersion() },
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
  public async checkAll(
    serviceUrls: Record<string, string> = {},
    arkApiUrl?: string
  ): Promise<StatusData> {
    // Always check ark-api if provided
    const serviceChecks: Promise<ServiceStatus>[] = [];

    if (arkApiUrl) {
      serviceChecks.push(this.checkArkApi(arkApiUrl));
    }

    // Dynamically check all discovered services
    for (const [serviceName, serviceUrl] of Object.entries(serviceUrls)) {
      if (serviceName === 'ark-api' && arkApiUrl) {
        // Skip if we already added ark-api above
        continue;
      }
      serviceChecks.push(
        this.checkServiceHealth(
          serviceName,
          serviceUrl,
          `${serviceName} is running`,
          this.getHealthPath(serviceName)
        )
      );
    }

    // Always check dependencies
    const dependenciesCheck = this.checkDependencies();

    const [dependencies, ...serviceStatuses] = await Promise.all([
      dependenciesCheck,
      ...serviceChecks,
    ]);

    return {
      services: serviceStatuses,
      dependencies,
    };
  }

  /**
   * Get appropriate health check path for different service types
   */
  private getHealthPath(serviceName: string): string {
    // Some services might need specific health check paths
    switch (serviceName) {
      case 'ark-api':
        return '/health';
      case 'ark-api-a2a':
        return '/health'; // ark-api-a2a has a working /health endpoint
      case 'ark-dashboard':
        return ''; // Dashboard typically responds to root
      case 'langfuse':
        return ''; // Langfuse responds to root path
      default:
        return ''; // Default to root path
    }
  }
}
