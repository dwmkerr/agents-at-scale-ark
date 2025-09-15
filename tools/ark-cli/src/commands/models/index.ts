import {Command} from 'commander';
import {ArkApiProxy} from '../../lib/arkApiProxy.js';
import {ArkApiClient} from '../../lib/arkApiClient.js';
import output from '../../lib/output.js';
import {createModel} from './create.js';

async function listModels(
  arkApiClient: ArkApiClient,
  options: {output?: string}
) {
  try {
    const models = await arkApiClient.getModels();

    if (options.output === 'json') {
      console.log(JSON.stringify(models, null, 2));
    } else {
      if (models.length === 0) {
        output.info('No models found');
        return;
      }

      models.forEach((model) => {
        console.log(`model/${model.name}`);
      });
    }
  } catch (error) {
    output.error(
      `Failed to list models: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    process.exit(1);
  }
}

export function createModelsCommand(): Command {
  const modelsCommand = new Command('models');

  modelsCommand
    .description('List available models')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(async (options) => {
      const proxy = new ArkApiProxy();
      try {
        const arkApiClient = await proxy.start();
        await listModels(arkApiClient, options);
      } catch (error) {
        output.error(
          error instanceof Error
            ? error.message
            : 'Failed to connect to ARK API'
        );
        process.exit(1);
      } finally {
        proxy.stop();
      }
    });

  const listCommand = new Command('list');
  listCommand
    .alias('ls')
    .description('List available models')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(async (options) => {
      const proxy = new ArkApiProxy();
      try {
        const arkApiClient = await proxy.start();
        await listModels(arkApiClient, options);
      } catch (error) {
        output.error(
          error instanceof Error
            ? error.message
            : 'Failed to connect to ARK API'
        );
        process.exit(1);
      } finally {
        proxy.stop();
      }
    });

  modelsCommand.addCommand(listCommand);

  // Add create command
  const createCommand = new Command('create');
  createCommand
    .description('Create a new model')
    .argument('[name]', 'Model name (optional)')
    .action(async (name) => {
      await createModel(name);
    });

  modelsCommand.addCommand(createCommand);

  return modelsCommand;
}
