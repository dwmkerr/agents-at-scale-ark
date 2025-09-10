/**
 * Configuration management commands for ARK CLI
 */

import {Command} from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import {ConfigManager} from '../lib/config.js';
import {ErrorHandler} from '../lib/errors.js';
import {OutputFormatter, EnhancedPrompts} from '../lib/progress.js';

export function createConfigCommand(): Command {
  const config = new Command('config');
  config
    .description('Manage ARK CLI configuration')
    .addHelpText(
      'before',
      `
${chalk.blue('⚙️  ARK Configuration Management')}
Manage your ARK CLI preferences and defaults.
`
    )
    .addHelpText(
      'after',
      `
${chalk.cyan('Examples:')}
  ${chalk.yellow('ark config list')}                    # Show current configuration
  ${chalk.yellow('ark config set defaultProjectType with-samples')}
  ${chalk.yellow('ark config get defaultProjectType')}  # Get specific value
  ${chalk.yellow('ark config edit')}                    # Interactive configuration
  ${chalk.yellow('ark config reset')}                   # Reset to defaults
`
    );

  // List command - show current configuration
  const listCommand = new Command('list');
  listCommand
    .alias('ls')
    .description('Show current configuration')
    .option('--json', 'Output in JSON format', false)
    .action((options) => {
      ErrorHandler.catchAndHandle(async () => {
        const configManager = new ConfigManager();
        const currentConfig = configManager.getMergedConfig();

        if (options.json) {
          console.log(JSON.stringify(currentConfig, null, 2));
          return;
        }

        console.log(chalk.blue('\n⚙️  ARK CLI Configuration\n'));

        // Generator settings
        console.log(chalk.cyan('🎯 Generator Defaults:'));
        OutputFormatter.formatKeyValueList([
          {
            key: 'Project Type',
            value: currentConfig.defaultProjectType,
            highlight: true,
          },
          {
            key: 'Default Destination',
            value: currentConfig.defaultDestination,
          },
          {
            key: 'Skip Git by Default',
            value: currentConfig.skipGitByDefault ? 'yes' : 'no',
          },
          {
            key: 'Skip Models by Default',
            value: currentConfig.skipModelsbyDefault ? 'yes' : 'no',
          },
          {
            key: 'Default Model Provider',
            value: currentConfig.defaultModelProvider,
          },
        ]);

        // User preferences
        console.log(chalk.cyan('\n👤 User Preferences:'));
        OutputFormatter.formatKeyValueList([
          {key: 'Preferred Editor', value: currentConfig.preferredEditor},
          {
            key: 'Color Output',
            value: currentConfig.colorOutput ? 'enabled' : 'disabled',
          },
          {
            key: 'Verbose Output',
            value: currentConfig.verboseOutput ? 'enabled' : 'disabled',
          },
        ]);

        // Advanced settings
        console.log(chalk.cyan('\n🔧 Advanced Settings:'));
        OutputFormatter.formatKeyValueList([
          {
            key: 'Parallel Operations',
            value: currentConfig.parallelOperations ? 'enabled' : 'disabled',
          },
          {
            key: 'Max Concurrent Files',
            value: currentConfig.maxConcurrentFiles.toString(),
          },
          {
            key: 'File Watching',
            value: currentConfig.fileWatchingEnabled ? 'enabled' : 'disabled',
          },
          {
            key: 'Telemetry',
            value: currentConfig.telemetryEnabled ? 'enabled' : 'disabled',
          },
        ]);

        console.log(
          chalk.gray(`\nConfig file: ${configManager.getConfigFilePath()}`)
        );
        console.log(
          chalk.gray('Use "ark config edit" for interactive configuration\n')
        );
      }, 'Listing configuration').catch(ErrorHandler.handleAndExit);
    });

  // Get command - get a specific configuration value
  const getCommand = new Command('get');
  getCommand
    .description('Get a specific configuration value')
    .argument('<key>', 'Configuration key to retrieve')
    .action((key) => {
      ErrorHandler.catchAndHandle(async () => {
        const configManager = new ConfigManager();
        const currentConfig = configManager.getMergedConfig();

        if (key in currentConfig) {
          const value = currentConfig[key as keyof typeof currentConfig];
          console.log(
            typeof value === 'object'
              ? JSON.stringify(value, null, 2)
              : String(value)
          );
        } else {
          console.error(chalk.red(`Unknown configuration key: ${key}`));
          console.log(chalk.gray('Available keys:'));
          Object.keys(currentConfig).forEach((k) =>
            console.log(chalk.gray(`  ${k}`))
          );
          process.exit(1);
        }
      }, 'Getting configuration value').catch(ErrorHandler.handleAndExit);
    });

  // Set command - set a specific configuration value
  const setCommand = new Command('set');
  setCommand
    .description('Set a specific configuration value')
    .argument('<key>', 'Configuration key to set')
    .argument('<value>', 'Value to set')
    .action((key, value) => {
      ErrorHandler.catchAndHandle(async () => {
        const configManager = new ConfigManager();
        const currentConfig = configManager.getConfig();

        if (!(key in currentConfig)) {
          console.error(chalk.red(`Unknown configuration key: ${key}`));
          console.log(chalk.gray('Available keys:'));
          Object.keys(currentConfig).forEach((k) =>
            console.log(chalk.gray(`  ${k}`))
          );
          process.exit(1);
        }

        // Parse value based on the current type
        const currentValue = currentConfig[key as keyof typeof currentConfig];
        let parsedValue: string | boolean | number = value;

        if (typeof currentValue === 'boolean') {
          parsedValue = ['true', 'yes', '1', 'on'].includes(
            value.toLowerCase()
          );
        } else if (typeof currentValue === 'number') {
          parsedValue = parseInt(value, 10);
          if (isNaN(parsedValue)) {
            console.error(chalk.red(`Invalid number value: ${value}`));
            process.exit(1);
          }
        }

        // Update configuration
        configManager.set(key as keyof typeof currentConfig, parsedValue);

        // Validate the configuration
        configManager.validateConfig();

        console.log(chalk.green(`✅ Set ${key} = ${parsedValue}`));
      }, 'Setting configuration value').catch(ErrorHandler.handleAndExit);
    });

  // Edit command - interactive configuration editor
  const editCommand = new Command('edit');
  editCommand.description('Edit configuration interactively').action(() => {
    ErrorHandler.catchAndHandle(async () => {
      const configManager = new ConfigManager();
      const currentConfig = configManager.getConfig();

      console.log(chalk.blue('\n⚙️  ARK CLI Configuration Editor\n'));
      EnhancedPrompts.showInfo('Leave fields empty to keep current values');

      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'defaultProjectType',
          message: 'Default project type:',
          choices: [
            {
              name: 'with-samples (recommended for beginners)',
              value: 'with-samples',
            },
            {name: 'empty (for experienced users)', value: 'empty'},
          ],
          default: currentConfig.defaultProjectType,
        },
        {
          type: 'input',
          name: 'defaultDestination',
          message: 'Default destination directory:',
          default: currentConfig.defaultDestination,
        },
        {
          type: 'list',
          name: 'defaultModelProvider',
          message: 'Default model provider:',
          choices: [
            {name: 'Azure OpenAI (recommended)', value: 'azure'},
            {name: 'OpenAI', value: 'openai'},
            {name: 'Claude (Anthropic)', value: 'claude'},
            {name: 'Gemini (Google)', value: 'gemini'},
            {name: 'Custom', value: 'custom'},
          ],
          default: currentConfig.defaultModelProvider,
        },
        {
          type: 'input',
          name: 'preferredEditor',
          message: 'Preferred editor command:',
          default: currentConfig.preferredEditor,
        },
        {
          type: 'confirm',
          name: 'skipGitByDefault',
          message: 'Skip git setup by default?',
          default: currentConfig.skipGitByDefault,
        },
        {
          type: 'confirm',
          name: 'skipModelsbyDefault',
          message: 'Skip model configuration by default?',
          default: currentConfig.skipModelsbyDefault,
        },
        {
          type: 'confirm',
          name: 'colorOutput',
          message: 'Enable colored output?',
          default: currentConfig.colorOutput,
        },
        {
          type: 'confirm',
          name: 'verboseOutput',
          message: 'Enable verbose output?',
          default: currentConfig.verboseOutput,
        },
        {
          type: 'number',
          name: 'maxConcurrentFiles',
          message: 'Maximum concurrent file operations:',
          default: currentConfig.maxConcurrentFiles,
          validate: (input) =>
            input !== undefined && input >= 1 && input <= 100
              ? true
              : 'Must be between 1 and 100',
        },
      ]);

      // Update configuration
      configManager.updateConfig(answers);

      // Validate the configuration
      configManager.validateConfig();

      EnhancedPrompts.showSuccess('Configuration updated successfully');
      console.log(
        chalk.gray(`Config saved to: ${configManager.getConfigFilePath()}\n`)
      );
    }, 'Editing configuration').catch(ErrorHandler.handleAndExit);
  });

  // Reset command - reset to default configuration
  const resetCommand = new Command('reset');
  resetCommand
    .description('Reset configuration to defaults')
    .option('--confirm', 'Skip confirmation prompt', false)
    .action((options) => {
      ErrorHandler.catchAndHandle(async () => {
        if (!options.confirm) {
          const {confirmReset} = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmReset',
              message:
                'Are you sure you want to reset all configuration to defaults?',
              default: false,
            },
          ]);

          if (!confirmReset) {
            console.log(chalk.yellow('Reset cancelled'));
            return;
          }
        }

        const configManager = new ConfigManager();
        configManager.resetConfig();

        EnhancedPrompts.showSuccess('Configuration reset to defaults');
        console.log(
          chalk.gray(`Config file: ${configManager.getConfigFilePath()}\n`)
        );
      }, 'Resetting configuration').catch(ErrorHandler.handleAndExit);
    });

  // Export command - export configuration for backup
  const exportCommand = new Command('export');
  exportCommand
    .description('Export configuration to JSON')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .action((options) => {
      ErrorHandler.catchAndHandle(async () => {
        const configManager = new ConfigManager();
        const configJson = configManager.exportConfig();

        if (options.output) {
          const fs = await import('fs');
          fs.writeFileSync(options.output, configJson);
          EnhancedPrompts.showSuccess(
            `Configuration exported to ${options.output}`
          );
        } else {
          console.log(configJson);
        }
      }, 'Exporting configuration').catch(ErrorHandler.handleAndExit);
    });

  // Import command - import configuration from backup
  const importCommand = new Command('import');
  importCommand
    .description('Import configuration from JSON file')
    .argument('<file>', 'JSON file to import')
    .option('--merge', 'Merge with existing configuration', false)
    .action((file, options) => {
      ErrorHandler.catchAndHandle(async () => {
        const fs = await import('fs');
        const configJson = fs.readFileSync(file, 'utf-8');

        const configManager = new ConfigManager();

        if (options.merge) {
          const importedConfig = JSON.parse(configJson);
          configManager.updateConfig(importedConfig);
        } else {
          configManager.importConfig(configJson);
        }

        EnhancedPrompts.showSuccess(`Configuration imported from ${file}`);
      }, 'Importing configuration').catch(ErrorHandler.handleAndExit);
    });

  // Add subcommands
  config.addCommand(listCommand);
  config.addCommand(getCommand);
  config.addCommand(setCommand);
  config.addCommand(editCommand);
  config.addCommand(resetCommand);
  config.addCommand(exportCommand);
  config.addCommand(importCommand);

  return config;
}
