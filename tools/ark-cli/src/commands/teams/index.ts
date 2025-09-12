import {Command} from 'commander';
import {ArkApiProxy} from '../../lib/arkApiProxy.js';
import {ArkApiClient} from '../../lib/arkApiClient.js';
import output from '../../lib/output.js';

async function listTeams(
  arkApiClient: ArkApiClient,
  options: {output?: string}
) {
  try {
    const teams = await arkApiClient.getTeams();

    if (options.output === 'json') {
      console.log(JSON.stringify(teams, null, 2));
    } else {
      if (teams.length === 0) {
        output.info('No teams found');
        return;
      }

      teams.forEach((team) => {
        console.log(`team/${team.name}`);
      });
    }
  } catch (error) {
    output.error(
      `Failed to list teams: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    process.exit(1);
  }
}

export function createTeamsCommand(): Command {
  const teamsCommand = new Command('teams');

  teamsCommand
    .description('List available teams')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(async (options) => {
      const proxy = new ArkApiProxy();
      try {
        const arkApiClient = await proxy.start();
        await listTeams(arkApiClient, options);
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
    .description('List available teams')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(async (options) => {
      const proxy = new ArkApiProxy();
      try {
        const arkApiClient = await proxy.start();
        await listTeams(arkApiClient, options);
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

  teamsCommand.addCommand(listCommand);

  return teamsCommand;
}
