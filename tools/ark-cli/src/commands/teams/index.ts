import {Command} from 'commander';
import {execa} from 'execa';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';

async function listTeams(options: {output?: string}) {
  try {
    // Use kubectl to get teams
    const result = await execa('kubectl', ['get', 'teams', '-o', 'json'], {
      stdio: 'pipe',
    });

    const data = JSON.parse(result.stdout);
    const teams = data.items || [];

    if (options.output === 'json') {
      // Output the raw items for JSON format
      console.log(JSON.stringify(teams, null, 2));
    } else {
      if (teams.length === 0) {
        output.info('No teams found');
        return;
      }

      teams.forEach((team: any) => {
        console.log(team.metadata.name);
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('the server doesn\'t have a resource type')) {
      output.error('Team CRDs not installed. Is the ARK controller running?');
    } else {
      output.error(
        `Failed to list teams: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
    process.exit(1);
  }
}

export function createTeamsCommand(_: ArkConfig): Command {
  const teamsCommand = new Command('teams');

  teamsCommand
    .description('List available teams')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(async (options) => {
      await listTeams(options);
    });

  const listCommand = new Command('list');
  listCommand
    .alias('ls')
    .description('List available teams')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(async (options) => {
      await listTeams(options);
    });

  teamsCommand.addCommand(listCommand);

  return teamsCommand;
}
