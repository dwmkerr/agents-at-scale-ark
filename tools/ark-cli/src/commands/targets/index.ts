import {Command} from 'commander';
import output from '../../lib/output.js';
import {ArkApiProxy} from '../../lib/arkApiProxy.js';

async function listTargets(options: {output?: string; type?: string}) {
  let proxy: ArkApiProxy | undefined;

  try {
    proxy = new ArkApiProxy();
    const arkApiClient = await proxy.start();

    const allTargets = await arkApiClient.getQueryTargets();

    // Filter by type if specified
    let filteredTargets = allTargets;
    if (options.type) {
      filteredTargets = allTargets.filter((t) => t.type === options.type);
    }

    // Sort targets by type and name
    filteredTargets.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type.localeCompare(b.type);
      }
      return a.name.localeCompare(b.name);
    });

    if (options.output === 'json') {
      console.log(JSON.stringify(filteredTargets, null, 2));
    } else {
      if (filteredTargets.length === 0) {
        output.warning('no targets available');
        return;
      }

      // Simple list output with type/name format
      for (const target of filteredTargets) {
        console.log(target.id);
      }
    }
  } catch (error) {
    output.error(
      'fetching targets:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  } finally {
    if (proxy) {
      proxy.stop();
    }
  }
}

export function createTargetsCommand(): Command {
  const targets = new Command('targets');
  targets
    .description('list available query targets (agents, teams, models, tools)')
    .option('-o, --output <format>', 'output format (json or text)', 'text')
    .option('-t, --type <type>', 'filter by type (agent, team, model, tool)')
    .action(async (options) => {
      await listTargets(options);
    });

  targets
    .command('list')
    .alias('ls')
    .description('list all available query targets')
    .option('-o, --output <format>', 'output format (json or text)', 'text')
    .option('-t, --type <type>', 'filter by type (agent, team, model, tool)')
    .action(async (options) => {
      await listTargets(options);
    });

  return targets;
}
