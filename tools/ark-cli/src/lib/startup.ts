import chalk from 'chalk';
import {checkCommandExists} from './commands.js';
import {loadConfig} from './config.js';
import type {ArkConfig} from './config.js';
import {getArkVersion} from './arkStatus.js';

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
 * Fetch version information (non-blocking)
 */
async function fetchVersionInfo(config: ArkConfig): Promise<void> {
  // Fetch latest version from GitHub
  try {
    const response = await fetch(
      'https://api.github.com/repos/mckinsey/agents-at-scale-ark/releases/latest'
    );
    if (response.ok) {
      const data = (await response.json()) as {tag_name: string};
      config.latestVersion = data.tag_name;
    }
  } catch {
    // Silently fail - latestVersion will remain undefined
  }

  // Fetch current installed version
  try {
    const currentVersion = await getArkVersion();
    if (currentVersion) {
      config.currentVersion = currentVersion;
    }
  } catch {
    // Silently fail - currentVersion will remain undefined
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

  // Fetch version info asynchronously (don't await)
  fetchVersionInfo(config);

  return config;
}
