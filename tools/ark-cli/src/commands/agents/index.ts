import {Command} from 'commander';
import {ArkApiProxy} from '../../lib/arkApiProxy.js';
import output from '../../lib/output.js';

async function listAgents(options: {output?: string}) {
  let proxy: ArkApiProxy | undefined;

  try {
    proxy = new ArkApiProxy();
    const arkApiClient = await proxy.start();

    const agents = await arkApiClient.getAgents();

    if (options.output === 'json') {
      console.log(JSON.stringify(agents, null, 2));
    } else {
      if (agents.length === 0) {
        output.warning('no agents available');
        return;
      }

      // Simple list output - just agent names
      agents.forEach((agent) => {
        console.log(agent.name);
      });
    }
  } catch (error) {
    output.error(
      'fetching agents:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  } finally {
    if (proxy) {
      proxy.stop();
    }
  }
}

export function createAgentsCommand(): Command {
  const agentsCommand = new Command('agents');

  agentsCommand
    .description('list available agents')
    .alias('agent')
    .option('-o, --output <format>', 'output format (json or text)', 'text')
    .action(async (options) => {
      await listAgents(options);
    });

  // Add list subcommand (same as default action)
  agentsCommand
    .command('list')
    .alias('ls')
    .description('list all available agents')
    .option('-o, --output <format>', 'output format (json or text)', 'text')
    .action(async (options) => {
      await listAgents(options);
    });

  return agentsCommand;
}
