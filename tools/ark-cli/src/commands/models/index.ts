import {Command} from 'commander';
import {execa} from 'execa';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';
import {createModel} from './create.js';

async function listModels(options: {output?: string}) {
  try {
    // Use kubectl to get models
    const result = await execa('kubectl', ['get', 'models', '-o', 'json'], {
      stdio: 'pipe',
    });

    const data = JSON.parse(result.stdout);
    const models = data.items || [];

    if (options.output === 'json') {
      // Output the raw items for JSON format
      console.log(JSON.stringify(models, null, 2));
    } else {
      if (models.length === 0) {
        output.info('No models found');
        return;
      }

      // Just output the model names
      models.forEach((model: {metadata: {name: string}}) => {
        console.log(model.metadata.name);
      });
    }
  } catch (error) {
    output.error(
      'fetching models:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

export function createModelsCommand(_: ArkConfig): Command {
  const modelsCommand = new Command('models');

  modelsCommand
    .description('List available models')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(async (options) => {
      await listModels(options);
    });

  const listCommand = new Command('list');
  listCommand
    .alias('ls')
    .description('List available models')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(async (options) => {
      await listModels(options);
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
