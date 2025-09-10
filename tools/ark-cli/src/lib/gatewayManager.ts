import * as k8s from '@kubernetes/client-node';

import {KubernetesConfigManager} from './kubernetes.js';

export class GatewayManager {
  private kubernetesManager: KubernetesConfigManager;

  constructor() {
    this.kubernetesManager = new KubernetesConfigManager();
  }

  /**
   * Check if localhost-gateway port-forward is running by testing the endpoint
   */
  async isPortForwardRunning(port: number = 8080): Promise<boolean> {
    try {
      const axios = (await import('axios')).default;
      await axios.get(`http://127.0.0.1:${port}`, {
        timeout: 2000,
        validateStatus: () => true,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if localhost-gateway service is deployed in cluster
   */
  async isGatewayDeployed(): Promise<boolean> {
    try {
      await this.kubernetesManager.initializeConfig();
      const kc = this.kubernetesManager.getKubeConfig();
      const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

      await k8sApi.readNamespacedService({
        name: 'localhost-gateway-nginx',
        namespace: 'ark-system',
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if port-forward is needed and provide setup instructions
   */
  async checkPortForwardStatus(port: number = 8080): Promise<{
    isRunning: boolean;
    needsSetup: boolean;
    instructions?: string;
  }> {
    const isRunning = await this.isPortForwardRunning(port);

    if (isRunning) {
      return {isRunning: true, needsSetup: false};
    }

    const isDeployed = await this.isGatewayDeployed();
    if (!isDeployed) {
      return {
        isRunning: false,
        needsSetup: true,
        instructions: this.getSetupInstructions(),
      };
    }

    return {
      isRunning: false,
      needsSetup: true,
      instructions: `Gateway is deployed but port-forward not running. Start it with:\nkubectl port-forward -n ark-system service/localhost-gateway-nginx ${port}:80`,
    };
  }

  /**
   * Get setup instructions for fresh installations
   */
  getSetupInstructions(): string {
    return `
🔧 ARK Gateway Setup Required:

To enable service discovery, you need to install the localhost-gateway:

1. From your agents-at-scale project root, run:
   make localhost-gateway-install

2. This will:
   - Install Gateway API CRDs
   - Deploy NGINX Gateway Fabric
   - Set up port-forwarding to localhost:8080

3. Then run 'ark check status' again

For more info: docs/content/ark-101/ark-gateway.mdx
`;
  }
}
