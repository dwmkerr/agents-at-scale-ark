import { Command } from 'commander';
import chalk from 'chalk';
import { execa } from 'execa';
import inquirer from 'inquirer';
import { isCommandAvailable } from '../lib/commandUtils.js';
import { getClusterInfo } from '../lib/cluster.js';
import { charts } from '../charts/charts.js';
import { dependencies } from '../charts/dependencies.js';
import { ArkChart, Dependency } from '../charts/types.js';

async function installArk() {
  // Check if helm is installed
  const helmInstalled = await isCommandAvailable('helm');
  if (!helmInstalled) {
    console.error(chalk.red('Helm is not installed. Please install Helm first:'));
    console.error(chalk.cyan('  https://helm.sh/docs/intro/install/'));
    process.exit(1);
  }

  // Check if kubectl is installed (needed for some dependencies)
  const kubectlInstalled = await isCommandAvailable('kubectl');
  if (!kubectlInstalled) {
    console.error(chalk.red('kubectl is not installed. Please install kubectl first:'));
    console.error(chalk.cyan('  https://kubernetes.io/docs/tasks/tools/'));
    process.exit(1);
  }

  // Check cluster connectivity
  const clusterInfo = await getClusterInfo();
  
  if (clusterInfo.error) {
    console.error(chalk.red('✗ No Kubernetes cluster detected'));
    console.error(chalk.gray('Please ensure you have a running cluster and kubectl is configured.'));
    console.error(chalk.gray('For local development, you can use minikube, kind, or Docker Desktop.'));
    process.exit(1);
  }

  // Confirm installation to this cluster
  console.log(chalk.green(`✓ Connected to cluster: ${chalk.bold(clusterInfo.context)}`));
  console.log(chalk.gray(`  Type: ${clusterInfo.type}`));
  console.log(chalk.gray(`  Namespace: ${clusterInfo.namespace}`));
  if (clusterInfo.ip) {
    console.log(chalk.gray(`  IP: ${clusterInfo.ip}`));
  }
  
  const { shouldProceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldProceed',
      message: `Install ARK to cluster '${clusterInfo.context}'?`,
      default: true,
    },
  ]);

  if (!shouldProceed) {
    console.log(chalk.yellow('Installation cancelled'));
    process.exit(0);
  }
  
  // Ask about installing dependencies
  const { shouldInstallDeps } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldInstallDeps',
      message: 'Install required dependencies (cert-manager, Gateway API)?',
      default: true,
    },
  ]);

  if (shouldInstallDeps) {
    console.log(chalk.cyan('\nInstalling dependencies...'));
    
    for (const [key, dep] of Object.entries(dependencies)) {
      console.log(chalk.gray(`  Installing ${dep.description || dep.name}...`));
      
      try {
        await execa(dep.command, dep.args, {
          stdio: 'inherit'
        });
        console.log(chalk.green(`  ✓ ${dep.name} completed`));
      } catch (error: any) {
        console.error(chalk.red(`  ✗ Failed to install ${dep.name}`));
        process.exit(1);
      }
    }
  }

  console.log(chalk.gray('\nSelect which ARK components to install:\n'));

  // Iterate through charts in order
  for (const [key, chart] of Object.entries(charts)) {
    // Ask for confirmation
    const { shouldInstall } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldInstall',
        message: `Install ${chalk.bold(chart.name)}? ${chart.description ? chalk.gray(`(${chart.description})`) : ''}`,
        default: true,
      },
    ]);

    if (!shouldInstall) {
      console.log(chalk.yellow(`  Skipping ${chart.name}`));
      continue;
    }

    console.log(chalk.cyan(`\nInstalling ${chart.name}...`));

    try {
      // Build helm arguments
      const helmArgs = [
        'upgrade',
        '--install',
        chart.name,
        chart.chartPath,
        '--namespace', chart.namespace,
      ];

      // Add any additional args from the chart definition
      if (chart.args) {
        helmArgs.push(...chart.args);
      }

      // Run helm upgrade --install with streaming output
      await execa('helm', helmArgs, {
        stdio: 'inherit'
      });

      console.log(chalk.green(`✓ ${chart.name} installed successfully`));
    } catch (error: any) {
      console.error(chalk.red(`✗ Failed to install ${chart.name}`));
      if (error.exitCode !== undefined) {
        // Ask if user wants to continue with other charts
        const { shouldContinue } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldContinue',
            message: 'Continue with remaining charts?',
            default: true,
          },
        ]);
        if (!shouldContinue) {
          process.exit(error.exitCode);
        }
      } else {
        console.error(chalk.red('Error:'), error.message);
        process.exit(1);
      }
    }
  }

  console.log(chalk.green('\n✓ ARK installation completed'));
}

export function createInstallCommand() {
  const command = new Command('install');
  
  command
    .description('Install ARK components using Helm')
    .action(async () => {
      await installArk();
    });

  return command;
}