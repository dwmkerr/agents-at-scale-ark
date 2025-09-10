import { Command } from 'commander';
import chalk from 'chalk';
import { execa } from 'execa';
import { isCommandAvailable } from '../lib/commandUtils.js';

// Configuration constants
const CHART_REGISTRY = 'oci://ghcr.io/mckinsey/agents-at-scale-ark/charts';
const CHART_NAME = 'ark';
const RELEASE_NAME = 'ark-controller';
const NAMESPACE = 'ark-system';

// Helm values to set
const HELM_VALUES = {
  'rbac.enable': 'true',
};

async function installArk(options: { chart?: string }) {
  // Check if helm is installed
  const helmInstalled = await isCommandAvailable('helm');
  if (!helmInstalled) {
    console.error(chalk.red('Helm is not installed. Please install Helm first:'));
    console.error(chalk.cyan('  https://helm.sh/docs/intro/install/'));
    process.exit(1);
  }

  // Use provided chart or default to registry
  const chartSource = options.chart || `${CHART_REGISTRY}/${CHART_NAME}`;
  console.log(chalk.cyan(`Installing ARK from ${chartSource}...`));

  try {
    // Build helm arguments
    const helmArgs = [
      'upgrade',
      '--install',
      RELEASE_NAME,
      chartSource,
      '--namespace', NAMESPACE,
      '--create-namespace',
    ];

    // Add helm values
    Object.entries(HELM_VALUES).forEach(([key, value]) => {
      helmArgs.push('--set', `${key}=${value}`);
    });

    // Run helm upgrade --install with streaming output
    await execa('helm', helmArgs, {
      stdio: 'inherit'
    });

    console.log(chalk.green('\n✓ ARK installation completed'));
  } catch (error: any) {
    if (error.exitCode !== undefined) {
      // Helm command failed - error already shown via inherit
      process.exit(error.exitCode);
    }
    console.error(chalk.red('Installation failed:'), error.message);
    process.exit(1);
  }
}

export function createInstallCommand() {
  const command = new Command('install');
  
  command
    .description('Install ARK using Helm')
    .option('-c, --chart <path>', 'Helm chart path (defaults to OCI registry)')
    .action(async (options) => {
      await installArk(options);
    });

  return command;
}