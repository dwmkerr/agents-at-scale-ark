import {ChartCollection} from './types.js';

// const REGISTRY_BASE = 'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts';
const LOCAL_CHARTS = '/tmp/ark-charts'; // Temporary local path

/**
 * Predefined ARK chart configurations
 * Note: Charts will be installed in the order they are defined here
 */
export const charts: ChartCollection = {
  'ark-controller': {
    name: 'ark-controller',
    // chartPath: `${REGISTRY_BASE}/ark-controller`,
    chartPath: `${LOCAL_CHARTS}/ark-controller-0.1.32.tgz`,
    namespace: 'ark-system',
    args: ['--create-namespace', '--set', 'rbac.enable=true'],
    description: 'Core ARK controller for managing AI resources',
  },

  'ark-api': {
    name: 'ark-api',
    // chartPath: `${REGISTRY_BASE}/ark-api`,
    chartPath: `${LOCAL_CHARTS}/ark-api-0.1.0.tgz`,
    namespace: 'default',
    args: [],
    description: 'ARK API service for interacting with ARK resources',
  },

  'ark-dashboard': {
    name: 'ark-dashboard',
    // chartPath: `${REGISTRY_BASE}/ark-dashboard`,
    chartPath: `${LOCAL_CHARTS}/ark-dashboard-0.1.32.tgz`,
    namespace: 'default',
    args: [],
    description: 'Web-based dashboard for ARK',
  },

  'ark-mcp': {
    name: 'ark-mcp',
    // chartPath: `${REGISTRY_BASE}/ark-mcp`,
    chartPath: `${LOCAL_CHARTS}/ark-mcp-0.1.0.tgz`,
    namespace: 'default',
    args: [],
    description: 'MCP (Model Context Protocol) services for ARK',
  },

  'localhost-gateway': {
    name: 'localhost-gateway',
    // chartPath: `${REGISTRY_BASE}/localhost-gateway`,
    chartPath: `${LOCAL_CHARTS}/localhost-gateway-0.1.32.tgz`,
    namespace: 'ark-system',
    args: [],
    description: 'Gateway for local cluster access',
  },
};
