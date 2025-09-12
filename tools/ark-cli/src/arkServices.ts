/**
 * Centralized ARK service definitions used by both install and status commands
 */

export interface ArkService {
  name: string;
  helmReleaseName: string;
  description: string;
  namespace: string;
  healthPath?: string;
  gatewayUrl?: string;
  chartPath?: string;
  installArgs?: string[];
  k8sServiceName?: string;
  k8sServicePort?: number;
  k8sPortForwardLocalPort?: number;
  k8sDeploymentName?: string;
}

export interface ServiceCollection {
  [key: string]: ArkService;
}

export interface ArkDependency {
  name: string;
  command: string;
  args: string[];
  description: string;
}

export interface DependencyCollection {
  [key: string]: ArkDependency;
}

const LOCALHOST_GATEWAY_PORT = 8080;
const REGISTRY_BASE = 'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts';

/**
 * Dependencies that should be installed before ARK services
 * Note: Dependencies will be installed in the order they are defined here
 */
export const arkDependencies: DependencyCollection = {
  'cert-manager-repo': {
    name: 'cert-manager-repo',
    command: 'helm',
    args: [
      'repo',
      'add',
      'jetstack',
      'https://charts.jetstack.io',
      '--force-update',
    ],
    description: 'Add Jetstack Helm repository',
  },

  'helm-repo-update': {
    name: 'helm-repo-update',
    command: 'helm',
    args: ['repo', 'update'],
    description: 'Update Helm repositories',
  },

  'cert-manager': {
    name: 'cert-manager',
    command: 'helm',
    args: [
      'upgrade',
      '--install',
      'cert-manager',
      'jetstack/cert-manager',
      '--namespace',
      'cert-manager',
      '--create-namespace',
      '--set',
      'crds.enabled=true',
    ],
    description: 'Certificate management for Kubernetes',
  },

  'gateway-api-crds': {
    name: 'gateway-api-crds',
    command: 'kubectl',
    args: [
      'apply',
      '-f',
      'https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.3.0/standard-install.yaml',
    ],
    description: 'Gateway API CRDs',
  },
};

/**
 * Core ARK services with their installation and status check configurations
 */
export const arkServices: ServiceCollection = {
  'ark-controller': {
    name: 'ark-controller',
    helmReleaseName: 'ark-controller',
    description: 'Core ARK controller for managing AI resources',
    namespace: 'ark-system',
    chartPath: `${REGISTRY_BASE}/ark-controller`,
    installArgs: ['--create-namespace', '--set', 'rbac.enable=true'],
    k8sDeploymentName: 'ark-controller',
  },

  'ark-api': {
    name: 'ark-api',
    helmReleaseName: 'ark-api',
    description: 'ARK API service for interacting with ARK resources',
    namespace: 'default',
    healthPath: '/health',
    gatewayUrl: `http://ark-api.127.0.0.1.nip.io:${LOCALHOST_GATEWAY_PORT}`,
    chartPath: `${REGISTRY_BASE}/ark-api`,
    installArgs: [],
    k8sServiceName: 'ark-api',
    k8sServicePort: 80,
    k8sPortForwardLocalPort: 34780,
    k8sDeploymentName: 'ark-api',
  },

  'ark-dashboard': {
    name: 'ark-dashboard',
    helmReleaseName: 'ark-dashboard',
    description: 'Web-based dashboard for ARK',
    namespace: 'default',
    healthPath: '',
    gatewayUrl: `http://dashboard.127.0.0.1.nip.io:${LOCALHOST_GATEWAY_PORT}`,
    chartPath: `${REGISTRY_BASE}/ark-dashboard`,
    installArgs: [],
    k8sServiceName: 'ark-dashboard',
    k8sServicePort: 3000,
    k8sPortForwardLocalPort: 3274,
    k8sDeploymentName: 'ark-dashboard',
  },

  'ark-api-a2a': {
    name: 'ark-api-a2a',
    helmReleaseName: 'ark-api-a2a',
    description: 'ARK API agent-to-agent communication service',
    namespace: 'default',
    healthPath: '/health',
    gatewayUrl: `http://ark-api-a2a.127.0.0.1.nip.io:${LOCALHOST_GATEWAY_PORT}`,
    // Note: This service might be installed as part of ark-api or separately
  },

  'ark-mcp': {
    name: 'ark-mcp',
    helmReleaseName: 'ark-mcp',
    description: 'MCP (Model Context Protocol) services for ARK',
    namespace: 'default',
    chartPath: `${REGISTRY_BASE}/ark-mcp`,
    installArgs: [],
  },

  'localhost-gateway': {
    name: 'localhost-gateway',
    helmReleaseName: 'localhost-gateway',
    description: 'Gateway for local cluster access',
    namespace: 'ark-system',
    chartPath: `${REGISTRY_BASE}/localhost-gateway`,
    installArgs: [],
  },
};

/**
 * Get services that can be installed via Helm charts
 */
export function getInstallableServices(): ServiceCollection {
  const installable: ServiceCollection = {};

  for (const [key, service] of Object.entries(arkServices)) {
    if (service.chartPath) {
      installable[key] = service;
    }
  }

  return installable;
}

/**
 * Get services that can be checked for status
 */
export function getStatusCheckableServices(): Record<string, string> {
  const statusServices: Record<string, string> = {};

  for (const [key, service] of Object.entries(arkServices)) {
    if (service.gatewayUrl) {
      statusServices[key] = service.gatewayUrl;
    }
  }

  return statusServices;
}

/**
 * Get health check path for a specific service
 */
export function getHealthPath(serviceName: string): string {
  const service = arkServices[serviceName];
  return service?.healthPath || '';
}
