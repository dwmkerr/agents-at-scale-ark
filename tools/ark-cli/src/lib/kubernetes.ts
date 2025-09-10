import {promises as fs} from 'fs';
import {homedir} from 'os';
import {join} from 'path';

import * as k8s from '@kubernetes/client-node';

import {KubernetesConfig} from './types.js';

export class KubernetesConfigManager {
  private kc: k8s.KubeConfig;

  constructor() {
    this.kc = new k8s.KubeConfig();
  }

  /**
   * Get the KubeConfig instance for API client creation
   */
  getKubeConfig(): k8s.KubeConfig {
    return this.kc;
  }

  /**
   * Initialize Kubernetes configuration similar to fark's approach
   * Priority: in-cluster config > KUBECONFIG env > ~/.kube/config
   */
  async initializeConfig(): Promise<KubernetesConfig> {
    let kubeconfig: string;
    let currentContext: string | undefined;
    let namespace: string | undefined;
    let inCluster = false;

    // Check if we're explicitly in a Kubernetes pod environment
    const isInPod =
      process.env.KUBERNETES_SERVICE_HOST &&
      process.env.KUBERNETES_SERVICE_PORT &&
      process.env.POD_NAMESPACE;

    if (isInPod) {
      try {
        // Try in-cluster config only if we're definitely in a pod
        this.kc.loadFromCluster();
        inCluster = true;
        kubeconfig = '/var/run/secrets/kubernetes.io/serviceaccount';
        namespace = process.env.POD_NAMESPACE || 'default';
      } catch (error) {
        throw new Error(
          `Failed to load in-cluster Kubernetes configuration: ${error}`
        );
      }
    } else {
      // Use kubeconfig file for local development
      try {
        kubeconfig =
          process.env.KUBECONFIG || join(homedir(), '.kube', 'config');

        // Check if kubeconfig file exists
        await fs.access(kubeconfig);

        this.kc.loadFromFile(kubeconfig);

        // Get current context and namespace
        currentContext = this.kc.currentContext;

        // Simplified namespace detection - just use default for now
        // Complex namespace detection can be added later if needed
        namespace = 'default';
      } catch (error) {
        throw new Error(`Failed to load Kubernetes configuration: ${error}`);
      }
    }

    return {
      kubeconfig,
      currentContext,
      namespace,
      inCluster,
    };
  }

  /**
   * Get the API server URL for the current cluster
   */
  getClusterApiUrl(): string {
    const cluster = this.kc.getCurrentCluster();
    if (!cluster) {
      throw new Error('No current cluster found in kubeconfig');
    }
    return cluster.server;
  }

  /**
   * Detect ark-api service URL in the cluster
   * This mimics how fark discovers services
   */
  async getArkApiUrl(namespace: string = 'default'): Promise<string> {
    const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);

    try {
      // Try to find ark-api service
      const service = await k8sApi.readNamespacedService({
        name: 'ark-api',
        namespace,
      });

      if (
        service.spec?.type === 'LoadBalancer' &&
        service.status?.loadBalancer?.ingress?.[0]
      ) {
        const ingress = service.status.loadBalancer.ingress[0];
        const host = ingress.ip || ingress.hostname;
        const port = service.spec.ports?.[0]?.port || 8080;
        return `http://${host}:${port}`;
      }

      if (service.spec?.type === 'NodePort' && service.spec.ports?.[0]) {
        const nodePort = service.spec.ports[0].nodePort;
        const clusterUrl = this.getClusterApiUrl();
        const clusterHost = new URL(clusterUrl).hostname;
        return `http://${clusterHost}:${nodePort}`;
      }

      // Default to port-forward style access
      const port = service.spec?.ports?.[0]?.port || 8080;
      return `http://localhost:${port}`;
    } catch (error) {
      // Service not found or not accessible
      throw new Error(
        `ark-api service not found or not accessible in namespace '${namespace}': ${error instanceof Error ? error.message : error}`
      );
    }
  }

  /**
   * Check if we can access the cluster
   */
  async testClusterAccess(): Promise<boolean> {
    try {
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
      await k8sApi.listNamespace();
      return true;
    } catch {
      return false;
    }
  }
}
