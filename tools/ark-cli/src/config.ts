import {promises as fs} from 'fs';
import {homedir} from 'os';
import {join} from 'path';

import axios from 'axios';
import Debug from 'debug';

import {ArkClient} from './lib/arkClient.js';
import {
  DEFAULT_ADDRESS_ARK_API,
  CONFIG_DIR_NAME,
  CONFIG_FILE_NAME,
} from './lib/consts.js';
import {GatewayManager} from './lib/gatewayManager.js';
import {KubernetesConfigManager} from './lib/kubernetes.js';
import {ArkConfig, KubernetesConfig} from './lib/types.js';

const debug = Debug('ark:config');

/**
 * ConfigManager handles ARK CLI configuration with automatic service discovery
 * and multiple fallback mechanisms. Complex discovery logic can be debugged by
 * setting DEBUG=ark:config or DEBUG=ark:* environment variable.
 *
 * Example usage:
 *   DEBUG=ark:config ark check status
 *   DEBUG=ark:* ark dashboard
 */

export class ConfigManager {
  private configDir: string;
  private configFile: string;
  private kubernetesManager: KubernetesConfigManager;
  private gatewayManager: GatewayManager;
  private kubeConfig: KubernetesConfig | null = null;

  constructor() {
    this.configDir = join(homedir(), '.config', CONFIG_DIR_NAME);
    this.configFile = join(this.configDir, CONFIG_FILE_NAME);
    this.kubernetesManager = new KubernetesConfigManager();
    this.gatewayManager = new GatewayManager();
  }

  async ensureConfigDir(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, {recursive: true});
    } catch (_error) {
      // Directory might already exist
    }
  }

  async loadConfig(): Promise<ArkConfig> {
    await this.ensureConfigDir();

    try {
      // Check if config file exists
      await fs.access(this.configFile);
    } catch (error: unknown) {
      // Config file doesn't exist - start with default config and enrich with kube config
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return await this.getDefaultConfig();
      }
      // Other access errors (permissions, etc.) should be thrown
      throw error;
    }

    try {
      // Config file exists - try to read and parse it
      const data = await fs.readFile(this.configFile, 'utf-8');
      const config = JSON.parse(data);

      // Merge with current Kubernetes config if not present
      await this.initKubernetesConfig();
      return {
        ...config,
        kubeconfig: config.kubeconfig || this.kubeConfig?.kubeconfig,
        currentContext:
          config.currentContext || this.kubeConfig?.currentContext,
        kubeNamespace: config.kubeNamespace || this.kubeConfig?.namespace,
      };
    } catch (error: unknown) {
      // If it's a JSON parsing error, throw a clear error message
      if (error instanceof SyntaxError) {
        throw new Error(
          `Invalid JSON in config file ${this.configFile}: ${error.message}`
        );
      }
      // Other errors (read errors, etc.) should be thrown as-is
      throw error;
    }
  }

  async saveConfig(config: ArkConfig): Promise<void> {
    await this.ensureConfigDir();
    const jsonData = JSON.stringify(config, null, 2);
    await fs.writeFile(this.configFile, jsonData);
  }

  async updateConfig(updates: Partial<ArkConfig>): Promise<ArkConfig> {
    const currentConfig = await this.loadConfig();
    const newConfig = {...currentConfig, ...updates};
    await this.saveConfig(newConfig);
    return newConfig;
  }

  private async getDefaultConfig(): Promise<ArkConfig> {
    // Initialize Kubernetes config to get defaults
    await this.initKubernetesConfig();

    return {
      defaultAgent: 'default',
      defaultModel: 'default',
      defaultNamespace: this.kubeConfig?.namespace || 'default',
      apiBaseUrl: DEFAULT_ADDRESS_ARK_API,
      kubeconfig: this.kubeConfig?.kubeconfig,
      currentContext: this.kubeConfig?.currentContext,
      kubeNamespace: this.kubeConfig?.namespace,
    };
  }

  async initializeConfig(): Promise<ArkConfig> {
    const config = await this.loadConfig();

    const defaultConfig = await this.getDefaultConfig();
    const mergedConfig = {...defaultConfig, ...config};

    await this.saveConfig(mergedConfig);
    return mergedConfig;
  }

  getConfigPath(): string {
    return this.configFile;
  }

  async getApiBaseUrl(): Promise<string> {
    const config = await this.loadConfig();

    // If apiBaseUrl is explicitly set in config, use it
    if (config.apiBaseUrl && config.apiBaseUrl !== DEFAULT_ADDRESS_ARK_API) {
      debug('using explicit config apiBaseUrl: %s', config.apiBaseUrl);
      return config.apiBaseUrl;
    }

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
        const namespace =
          config.kubeNamespace || config.defaultNamespace || 'default';
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

    const fallbackUrl = config.apiBaseUrl || DEFAULT_ADDRESS_ARK_API;
    debug('falling back to default: %s', fallbackUrl);
    return fallbackUrl;
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
    const port = 8080;
    // Known services that are typically exposed via localhost-gateway
    const knownServices = {
      'ark-api': `http://ark-api.127.0.0.1.nip.io:${port}`,
      'ark-dashboard': `http://dashboard.127.0.0.1.nip.io:${port}`,
      'ark-api-a2a': `http://ark-api-a2a.127.0.0.1.nip.io:${port}`,
      langfuse: `http://langfuse.telemetry.127.0.0.1.nip.io:${port}`, // Fixed URL to match HTTPRoute
      // Add other services as they become available via gateway
    };
    return knownServices;
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

  async getKubernetesConfig(): Promise<KubernetesConfig | null> {
    await this.initKubernetesConfig();
    return this.kubeConfig;
  }

  async testClusterAccess(): Promise<boolean> {
    await this.initKubernetesConfig();
    if (!this.kubeConfig) {
      return false;
    }
    return await this.kubernetesManager.testClusterAccess();
  }

  /**
   * Discover service URLs from ark-api service discovery
   */
  private async discoverServicesFromApi(): Promise<Record<string, string>> {
    try {
      const apiBaseUrl = await this.getApiBaseUrl();
      const arkClient = new ArkClient(apiBaseUrl);
      const config = await this.loadConfig();
      const namespace =
        config.kubeNamespace || config.defaultNamespace || 'default';

      debug(
        'service discovery: querying ark-api at %s (namespace: %s)',
        apiBaseUrl,
        namespace
      );
      const services = await arkClient.getArkServices(namespace);

      const serviceUrls: Record<string, string> = {};

      // Dynamically map all discovered services with HTTP routes
      for (const service of services) {
        if (service.httproutes && service.httproutes.length > 0) {
          const serviceName = service.release_name || service.name;
          const serviceUrl = service.httproutes[0].url; // Use first route URL
          serviceUrls[serviceName] = serviceUrl;
        }
      }

      const discoveredServices = Object.entries(serviceUrls).map(
        ([key, url]) => `${key}: ${url}`
      );
      debug(
        'service discovery: found %d services - %s',
        discoveredServices.length,
        discoveredServices.join(', ') || 'none'
      );
      return serviceUrls;
    } catch (error) {
      debug(
        'service discovery failed: %s',
        error instanceof Error ? error.message : error
      );
      // Return empty object if discovery fails - will fall back to config/defaults
      return {};
    }
  }

  async getServiceUrls(): Promise<Record<string, string>> {
    // Try localhost-gateway detection (works for everyone with standard setup)
    if (await this.isLocalhostGatewayRunning()) {
      const gatewayUrls = this.getLocalhostGatewayUrls();
      debug('localhost-gateway detected, using: %o', gatewayUrls);
      return gatewayUrls;
    }

    // Try to discover services from ark-api (requires kubeconfig)
    const discoveredUrls = await this.discoverServicesFromApi();
    debug('discovered services: %o', discoveredUrls);
    return discoveredUrls;
  }
}
