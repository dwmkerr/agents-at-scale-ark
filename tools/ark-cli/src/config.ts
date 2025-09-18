import axios from 'axios';
import Debug from 'debug';

import {DEFAULT_ADDRESS_ARK_API} from './lib/consts.js';
import {KubernetesConfigManager} from './lib/kubernetes.js';
import {KubernetesConfig} from './lib/types.js';
import {getStatusCheckableServices} from './arkServices.js';

const debug = Debug('ark:config');

/**
 * ConfigManager handles API URL discovery and cluster access testing.
 * Complex discovery logic can be debugged by setting DEBUG=ark:config
 *
 * Example usage:
 *   DEBUG=ark:config ark status
 */

export class ConfigManager {
  private kubernetesManager: KubernetesConfigManager;
  private kubeConfig: KubernetesConfig | null = null;

  constructor() {
    this.kubernetesManager = new KubernetesConfigManager();
  }


  async getApiBaseUrl(): Promise<string> {
    // First try to detect localhost-gateway (works for everyone with standard setup)
    if (await this.isLocalhostGatewayRunning()) {
      const gatewayUrls = this.getLocalhostGatewayUrls();
      const arkApiUrl = gatewayUrls['ark-api'];
      if (arkApiUrl) {
        debug('localhost-gateway detected, using: %s', arkApiUrl);
        return arkApiUrl;
      }
    }

    // Try to discover ark-api service via Kubernetes (requires kubeconfig)
    await this.initKubernetesConfig();
    if (this.kubeConfig) {
      try {
        const namespace = 'default';
        const discoveredUrl =
          await this.kubernetesManager.getArkApiUrl(namespace);
        debug(
          'kubernetes discovery successful in %s: %s',
          namespace,
          discoveredUrl
        );
        return discoveredUrl;
      } catch (error) {
        debug(
          'kubernetes discovery failed: %s',
          error instanceof Error ? error.message : error
        );
        // Fall back to default if discovery fails
      }
    }

    debug('falling back to default: %s', DEFAULT_ADDRESS_ARK_API);
    return DEFAULT_ADDRESS_ARK_API;
  }

  /**
   * Check if localhost-gateway is running by testing port 8080
   */
  private async isLocalhostGatewayRunning(): Promise<boolean> {
    try {
      // Try to connect to the localhost gateway port
      const response = await axios.get('http://127.0.0.1:8080', {
        timeout: 2000,
        validateStatus: () => true, // Accept any status code, we just want to know if it's reachable
      });
      debug('localhost-gateway check: available (status %d)', response.status);
      return true;
    } catch (error) {
      debug(
        'localhost-gateway check: unavailable (%s)',
        error instanceof Error ? error.message : error
      );
      // Gateway not responding - fall back to other discovery methods
      return false;
    }
  }

  /**
   * Construct standard localhost-gateway URLs for known ARK services
   */
  private getLocalhostGatewayUrls(): Record<string, string> {
    // Use centralized service definitions from arkServices
    return getStatusCheckableServices();
  }

  private async initKubernetesConfig(): Promise<void> {
    if (!this.kubeConfig) {
      try {
        this.kubeConfig = await this.kubernetesManager.initializeConfig();
        debug(
          'kubernetes config loaded: context=%s namespace=%s',
          this.kubeConfig?.currentContext,
          this.kubeConfig?.namespace
        );
      } catch (error) {
        debug(
          'kubernetes config unavailable: %s',
          error instanceof Error ? error.message : error
        );
        // Kubernetes config not available - that's okay for some use cases
        this.kubeConfig = null;
      }
    }
  }

  async testClusterAccess(): Promise<boolean> {
    await this.initKubernetesConfig();
    if (!this.kubeConfig) {
      return false;
    }
    return await this.kubernetesManager.testClusterAccess();
  }
}
