import {Command} from 'commander';
import {ArkApiProxy} from '../../lib/arkApiProxy.js';
import {ArkApiClient} from '../../lib/arkApiClient.js';
import output from '../../lib/output.js';

async function listTools(
  arkApiClient: ArkApiClient,
  options: {output?: string}
) {
  try {
    const tools = await arkApiClient.getTools();

    if (options.output === 'json') {
      console.log(JSON.stringify(tools, null, 2));
    } else {
      if (tools.length === 0) {
        output.info('No tools found');
        return;
      }

      tools.forEach((tool) => {
        console.log(`tool/${tool.name}`);
      });
    }
  } catch (error) {
    output.error(
      `Failed to list tools: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    process.exit(1);
  }
}

export function createToolsCommand(): Command {
  const toolsCommand = new Command('tools');

  toolsCommand
    .description('List available tools')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(async (options) => {
      const proxy = new ArkApiProxy();
      try {
        const arkApiClient = await proxy.start();
        await listTools(arkApiClient, options);
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
    .description('List available tools')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(async (options) => {
      const proxy = new ArkApiProxy();
      try {
        const arkApiClient = await proxy.start();
        await listTools(arkApiClient, options);
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

  toolsCommand.addCommand(listCommand);

  return toolsCommand;
}
