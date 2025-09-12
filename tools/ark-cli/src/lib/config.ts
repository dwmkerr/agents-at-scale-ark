/**
 * Configuration management for ARK CLI
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import {SecurityUtils} from './security.js';
import {ValidationError} from './errors.js';

export interface ArkConfig {
  // Generator defaults
  defaultProjectType: 'empty' | 'with-samples';
  defaultDestination: string;
  skipGitByDefault: boolean;
  skipModelsbyDefault: boolean;

  // User preferences
  preferredEditor: string;
  colorOutput: boolean;
  verboseOutput: boolean;

  // Model provider defaults
  defaultModelProvider: 'azure' | 'openai' | 'claude' | 'gemini' | 'custom';

  // Template preferences
  templateDirectory?: string;
  customTemplates: Record<string, string>;

  // Advanced settings
  parallelOperations: boolean;
  maxConcurrentFiles: number;
  fileWatchingEnabled: boolean;

  // Telemetry and analytics (opt-in)
  telemetryEnabled: boolean;
  errorReporting: boolean;
}

export const DEFAULT_CONFIG: ArkConfig = {
  defaultProjectType: 'with-samples',
  defaultDestination: process.cwd(),
  skipGitByDefault: false,
  skipModelsbyDefault: false,
  preferredEditor: process.env.EDITOR || 'code',
  colorOutput: true,
  verboseOutput: false,
  defaultModelProvider: 'azure',
  customTemplates: {},
  parallelOperations: true,
  maxConcurrentFiles: 10,
  fileWatchingEnabled: false,
  telemetryEnabled: false,
  errorReporting: false,
};

export class ConfigManager {
  private configPath: string;
  private config: ArkConfig;

  constructor() {
    this.configPath = this.getConfigPath();
    this.config = this.loadConfig();
  }

  /**
   * Get the path to the configuration file
   */
  private getConfigPath(): string {
    const configDir =
      process.env.ARK_CONFIG_DIR || path.join(os.homedir(), '.config', 'ark');

    // Ensure config directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, {recursive: true, mode: 0o755});
    }

    return path.join(configDir, 'config.json');
  }

  /**
   * Load configuration from file or create with defaults
   */
  private loadConfig(): ArkConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const configContent = fs.readFileSync(this.configPath, 'utf-8');
        const userConfig = JSON.parse(configContent);

        // Merge with defaults to ensure all properties exist
        return {...DEFAULT_CONFIG, ...userConfig};
      }
    } catch (error) {
      console.warn(
        `Warning: Failed to load config from ${this.configPath}: ${error}`
      );
    }

    // Return defaults and save them
    this.saveConfig(DEFAULT_CONFIG);
    return {...DEFAULT_CONFIG};
  }

  /**
   * Save configuration to file
   */
  private saveConfig(config: ArkConfig): void {
    try {
      const configContent = JSON.stringify(config, null, 2);
      SecurityUtils.validatePath(this.configPath, 'config file');

      fs.writeFileSync(this.configPath, configContent, {
        mode: 0o600, // Owner read/write only
        flag: 'w',
      });
    } catch (error) {
      throw new ValidationError(
        `Failed to save configuration: ${error}`,
        'config',
        [
          'Check file permissions',
          'Ensure config directory exists',
          'Verify disk space',
        ]
      );
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): ArkConfig {
    return {...this.config};
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ArkConfig>): void {
    this.config = {...this.config, ...updates};
    this.saveConfig(this.config);
  }

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = {...DEFAULT_CONFIG};
    this.saveConfig(this.config);
  }

  /**
   * Get a specific configuration value
   */
  get<K extends keyof ArkConfig>(key: K): ArkConfig[K] {
    return this.config[key];
  }

  /**
   * Set a specific configuration value
   */
  set<K extends keyof ArkConfig>(key: K, value: ArkConfig[K]): void {
    this.config[key] = value;
    this.saveConfig(this.config);
  }

  /**
   * Validate configuration values
   */
  validateConfig(): void {
    const config = this.config;

    // Validate project type
    if (!['empty', 'with-samples'].includes(config.defaultProjectType)) {
      throw new ValidationError(
        `Invalid defaultProjectType: ${config.defaultProjectType}`,
        'defaultProjectType',
        ['Must be "empty" or "with-samples"']
      );
    }

    // Validate model provider
    const validProviders = ['azure', 'openai', 'claude', 'gemini', 'custom'];
    if (!validProviders.includes(config.defaultModelProvider)) {
      throw new ValidationError(
        `Invalid defaultModelProvider: ${config.defaultModelProvider}`,
        'defaultModelProvider',
        [`Must be one of: ${validProviders.join(', ')}`]
      );
    }

    // Validate numeric values
    if (config.maxConcurrentFiles < 1 || config.maxConcurrentFiles > 100) {
      throw new ValidationError(
        `Invalid maxConcurrentFiles: ${config.maxConcurrentFiles}`,
        'maxConcurrentFiles',
        ['Must be between 1 and 100']
      );
    }

    // Validate paths
    if (config.defaultDestination) {
      SecurityUtils.validatePath(
        config.defaultDestination,
        'default destination'
      );
    }

    if (config.templateDirectory) {
      SecurityUtils.validatePath(
        config.templateDirectory,
        'template directory'
      );
    }
  }

  /**
   * Get environment variable overrides
   */
  getEnvironmentOverrides(): Partial<ArkConfig> {
    const overrides: Partial<ArkConfig> = {};

    // Check for environment variable overrides
    if (process.env.ARK_DEFAULT_PROJECT_TYPE) {
      const projectType = process.env.ARK_DEFAULT_PROJECT_TYPE;
      if (['empty', 'with-samples'].includes(projectType)) {
        overrides.defaultProjectType = projectType as 'empty' | 'with-samples';
      }
    }

    if (process.env.ARK_DEFAULT_DESTINATION) {
      overrides.defaultDestination = process.env.ARK_DEFAULT_DESTINATION;
    }

    if (process.env.ARK_SKIP_GIT) {
      overrides.skipGitByDefault = process.env.ARK_SKIP_GIT === 'true';
    }

    if (process.env.ARK_SKIP_MODELS) {
      overrides.skipModelsbyDefault = process.env.ARK_SKIP_MODELS === 'true';
    }

    if (process.env.ARK_COLOR_OUTPUT) {
      overrides.colorOutput = process.env.ARK_COLOR_OUTPUT !== 'false';
    }

    if (process.env.ARK_VERBOSE) {
      overrides.verboseOutput = process.env.ARK_VERBOSE === 'true';
    }

    if (process.env.ARK_DEFAULT_MODEL_PROVIDER) {
      const provider = process.env.ARK_DEFAULT_MODEL_PROVIDER;
      const validProviders = [
        'azure',
        'openai',
        'claude',
        'gemini',
        'custom',
      ] as const;
      if ((validProviders as readonly string[]).includes(provider)) {
        overrides.defaultModelProvider =
          provider as (typeof validProviders)[number];
      }
    }

    return overrides;
  }

  /**
   * Get merged configuration with environment overrides
   */
  getMergedConfig(): ArkConfig {
    const envOverrides = this.getEnvironmentOverrides();
    return {...this.config, ...envOverrides};
  }

  /**
   * Export configuration for backup
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from backup
   */
  importConfig(configJson: string): void {
    try {
      const importedConfig = JSON.parse(configJson);

      // Validate the imported config
      const tempManager = new ConfigManager();
      tempManager.config = {...DEFAULT_CONFIG, ...importedConfig};
      tempManager.validateConfig();

      // If validation passes, update our config
      this.config = tempManager.config;
      this.saveConfig(this.config);
    } catch (error) {
      throw new ValidationError(
        `Failed to import configuration: ${error}`,
        'config',
        [
          'Check JSON syntax',
          'Ensure all required fields are present',
          'Verify configuration values are valid',
        ]
      );
    }
  }

  /**
   * Get configuration file path for CLI display
   */
  getConfigFilePath(): string {
    return this.configPath;
  }
}
