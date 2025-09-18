import chalk from 'chalk';
import {checkCommandExists} from './commands.js';
import {loadConfig} from './config.js';
import type {ArkConfig} from './config.js';

interface RequiredCommand {
  name: string;
  command: string;
  args: string[];
  installUrl: string;
}

const REQUIRED_COMMANDS: RequiredCommand[] = [
  {
    name: 'kubectl',
    command: 'kubectl',
    args: ['version', '--client'],
    installUrl: 'https://kubernetes.io/docs/tasks/tools/',
  },
  {
    name: 'helm',
    command: 'helm',
    args: ['version', '--short'],
    installUrl: 'https://helm.sh/docs/intro/install/',
  },
];

async function checkRequirements(): Promise<void> {
  const missing: RequiredCommand[] = [];

  for (const cmd of REQUIRED_COMMANDS) {
    const exists = await checkCommandExists(cmd.command, cmd.args);
    if (!exists) {
      missing.push(cmd);
    }
  }

  if (missing.length > 0) {
    for (const cmd of missing) {
      console.error(chalk.red('error:') + ` ${cmd.name} is required`);
      console.error('  ' + chalk.blue(cmd.installUrl));
    }
    process.exit(1);
  }
}

/**
 * Initialize the CLI by checking requirements and loading config
 */
export async function startup(): Promise<ArkConfig> {
  // Check required commands
  await checkRequirements();

  // Load config
  const config = loadConfig();

  return config;
}