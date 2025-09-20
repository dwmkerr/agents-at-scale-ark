export interface ArkConfig {
  defaultModel?: string;
  defaultAgent?: string;
  defaultNamespace?: string;
  apiBaseUrl?: string;
  kubeconfig?: string;
  currentContext?: string;
  kubeNamespace?: string;
}

export interface KubernetesConfig {
  kubeconfig: string;
  currentContext?: string;
  namespace?: string;
  inCluster: boolean;
}

export type DeploymentStatus =
  | 'available' // All replicas ready and available
  | 'progressing' // Deployment is rolling out
  | 'replicafailure' // Failed to create replicas
  | 'failed' // Deployment failed
  | 'not found' // Deployment doesn't exist
  | 'unknown'; // Unable to determine status

export type ServiceStatus = {
  name: string;
  status: 'healthy' | 'warning' | 'unhealthy' | 'not installed' | 'not ready';
  deploymentStatus?: DeploymentStatus;
  url?: string;
  version?: string;
  revision?: string;
  details?: string;
  isDev?: boolean;
  namespace?: string;
};

export interface DependencyStatus {
  name: string;
  installed: boolean;
  version?: string;
  details?: string;
}

export interface StatusData {
  services: ServiceStatus[];
  dependencies: DependencyStatus[];
  arkReady?: boolean;
  defaultModelExists?: boolean;
}

export interface CommandVersionConfig {
  command: string;
  versionArgs: string;
  versionExtract: (_output: string) => string;
}
