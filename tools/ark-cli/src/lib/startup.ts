import chalk from 'chalk';
import {checkCommandExists} from './commands.js';
import {loadConfig} from './config.js';
import type {ArkConfig} from './config.js';
import {getArkVersion} from './arkStatus.js';
import {getClusterInfo} from './cluster.js';

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
 * Show error message when no cluster is detected
 */
export function showNoClusterError(): void {
  console.log(chalk.red.bold('\n✗ No Kubernetes cluster detected\n'));
  console.log('Please ensure you have configured a connection to a Kubernetes cluster.');
  console.log('For local development, you can use:');
  console.log(`  • Minikube: ${chalk.blue('https://minikube.sigs.k8s.io/docs/start')}`);
  console.log(`  • Docker Desktop: ${chalk.blue('https://docs.docker.com/desktop/kubernetes/')}`);
  console.log(`  • Kind: ${chalk.blue('https://kind.sigs.k8s.io/docs/user/quick-start/')}`);
  console.log('');
  console.log('And more. For help, check the Quickstart guide:');
  console.log(chalk.blue('  https://mckinsey.github.io/agents-at-scale-ark/quickstart/'));
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
      // Remove 'v' prefix if present for consistent comparison
      config.latestVersion = data.tag_name.replace(/^v/, '');
    }
  } catch {
    // Silently fail - latestVersion will remain undefined
  }

  // Fetch current installed version (already without 'v' from helm)
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

  // Get cluster info - if no error, we have cluster access
  const clusterInfo = await getClusterInfo();
  if (!clusterInfo.error) {
    config.clusterInfo = clusterInfo;
  }

  // Fetch version info synchronously so it's available immediately
  await fetchVersionInfo(config);

  return config;
}
