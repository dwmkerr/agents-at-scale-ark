import {Command} from 'commander';
import output from '../lib/output.js';
import {ChatClient} from '../lib/chatClient.js';

export function createTargetsCommand(): Command {
  const targets = new Command('targets');
  targets.description(
    'manage and list available query targets (agents, teams, models, tools)'
  );

  targets
    .command('list')
    .alias('ls')
    .description('list all available query targets')
    .option('-o, --output <format>', 'output format (json or text)', 'text')
    .option('-t, --type <type>', 'filter by type (agent, team, model, tool)')
    .action(async (options) => {
      try {
        const client = new ChatClient();
        await client.initialize();

        const allTargets = await client.getQueryTargets();

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
      }
    });

  return targets;
}
