import {Command} from 'commander';
import {execa} from 'execa';
import output from '../../lib/output.js';

async function listAgents(options: {output?: string}) {
  try {
    // Use kubectl to get agents
    const result = await execa('kubectl', ['get', 'agents', '-o', 'json'], {
      stdio: 'pipe',
    });

    const data = JSON.parse(result.stdout);
    const agents = data.items || [];

    if (options.output === 'json') {
      // Output the raw items for JSON format
      console.log(JSON.stringify(agents, null, 2));
    } else {
      if (agents.length === 0) {
        output.warning('no agents available');
        return;
      }

      // Simple list output - just agent names
      agents.forEach((agent: any) => {
        console.log(agent.metadata.name);
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('the server doesn\'t have a resource type')) {
      output.error('Agent CRDs not installed. Is the ARK controller running?');
    } else {
      output.error(
        'fetching agents:',
        error instanceof Error ? error.message : error
      );
    }
    process.exit(1);
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
