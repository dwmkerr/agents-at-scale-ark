import { DependencyCollection } from './types.js';

/**
 * Dependencies that should be installed before ARK charts
 * Note: Dependencies will be installed in the order they are defined here
 */
export const dependencies: DependencyCollection = {
  'cert-manager-repo': {
    name: 'cert-manager-repo',
    command: 'helm',
    args: ['repo', 'add', 'jetstack', 'https://charts.jetstack.io', '--force-update'],
    description: 'Add Jetstack Helm repository'
  },
  
  'helm-repo-update': {
    name: 'helm-repo-update',
    command: 'helm',
    args: ['repo', 'update'],
    description: 'Update Helm repositories'
  },
  
  'cert-manager': {
    name: 'cert-manager',
    command: 'helm',
    args: [
      'upgrade', '--install', 'cert-manager', 'jetstack/cert-manager',
      '--namespace', 'cert-manager',
      '--create-namespace',
      '--set', 'crds.enabled=true'
    ],
    description: 'Certificate management for Kubernetes'
  },
  
  'gateway-api-crds': {
    name: 'gateway-api-crds',
    command: 'kubectl',
    args: ['apply', '-f', 'https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.3.0/standard-install.yaml'],
    description: 'Gateway API CRDs'
  }
};