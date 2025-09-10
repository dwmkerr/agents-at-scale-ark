import { ChartCollection } from './types.js';

const REGISTRY_BASE = 'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts';

/**
 * Predefined ARK chart configurations
 * Note: Charts will be installed in the order they are defined here
 */
export const charts: ChartCollection = {
  'ark-controller': {
    name: 'ark-controller',
    chartPath: `${REGISTRY_BASE}/ark-controller`,
    namespace: 'ark-system',
    args: [
      '--create-namespace',
      '--set', 'rbac.enable=true'
    ],
    description: 'Core ARK controller for managing AI resources'
  },
  
  'ark-api': {
    name: 'ark-api',
    chartPath: `${REGISTRY_BASE}/ark-api`,
    namespace: 'default',
    args: [],
    description: 'ARK API service for interacting with ARK resources'
  },
  
  'ark-dashboard': {
    name: 'ark-dashboard',
    chartPath: `${REGISTRY_BASE}/ark-dashboard`,
    namespace: 'default',
    args: [],
    description: 'Web-based dashboard for ARK'
  },
  
  'localhost-gateway': {
    name: 'localhost-gateway',
    chartPath: `${REGISTRY_BASE}/localhost-gateway`,
    namespace: 'default',
    args: [],
    description: 'Gateway for local cluster access'
  }
};