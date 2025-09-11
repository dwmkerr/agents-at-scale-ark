import {Command} from 'commander';
import chalk from 'chalk';
import {execa} from 'execa';
import inquirer from 'inquirer';
import {isCommandAvailable} from '../lib/commandUtils.js';
import {getClusterInfo} from '../lib/cluster.js';
import output from '../lib/output.js';
import {charts} from '../charts/charts.js';
import {dependencies} from '../charts/dependencies.js';

export async function installArk() {
  // Check if helm is installed
  const helmInstalled = await isCommandAvailable('helm');
  if (!helmInstalled) {
    output.error('helm is not installed. please install helm first:');
    output.info('https://helm.sh/docs/intro/install/');
    process.exit(1);
  }

  // Check if kubectl is installed (needed for some dependencies)
  const kubectlInstalled = await isCommandAvailable('kubectl');
  if (!kubectlInstalled) {
    output.error('kubectl is not installed. please install kubectl first:');
    output.info('https://kubernetes.io/docs/tasks/tools/');
    process.exit(1);
  }

  // Check cluster connectivity
  const clusterInfo = await getClusterInfo();

  if (clusterInfo.error) {
    output.error('no kubernetes cluster detected');
    output.info(
      'please ensure you have a running cluster and kubectl is configured.'
    );
    output.info(
      'for local development, you can use minikube, kind, or docker desktop.'
    );
    process.exit(1);
  }

  // Show cluster info
  output.success(`connected to cluster: ${chalk.bold(clusterInfo.context)}`);
  output.info(`type: ${clusterInfo.type}`);
  output.info(`namespace: ${clusterInfo.namespace}`);
  if (clusterInfo.ip) {
    output.info(`ip: ${clusterInfo.ip}`);
  }
  console.log(); // Add blank line after cluster info

  // Ask about installing dependencies
  const {shouldInstallDeps} = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldInstallDeps',
      message: 'install required dependencies (cert-manager, gateway api)?',
      default: true,
    },
  ]);

  if (shouldInstallDeps) {
    for (const dep of Object.values(dependencies)) {
      output.info(`installing ${dep.description || dep.name}...`);

      try {
        await execa(dep.command, dep.args, {
          stdio: 'inherit',
        });
        output.success(`${dep.name} completed`);
        console.log(); // Add blank line after dependency
      } catch {
        console.log(); // Add blank line after error
        process.exit(1);
      }
    }
  }

  // Iterate through charts in order
  for (const chart of Object.values(charts)) {
    // Ask for confirmation
    const {shouldInstall} = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldInstall',
        message: `install ${chalk.bold(chart.name)}? ${chart.description ? chalk.gray(`(${chart.description.toLowerCase()})`) : ''}`,
        default: true,
      },
    ]);

    if (!shouldInstall) {
      output.warning(`skipping ${chart.name}`);
      continue;
    }

    try {
      // Build helm arguments
      const helmArgs = [
        'upgrade',
        '--install',
        chart.name,
        chart.chartPath,
        '--namespace',
        chart.namespace,
      ];

      // Add any additional args from the chart definition
      if (chart.args) {
        helmArgs.push(...chart.args);
      }

      // Run helm upgrade --install with streaming output
      await execa('helm', helmArgs, {
        stdio: 'inherit',
      });

      console.log(); // Add blank line after command output
    } catch {
      // Continue with remaining charts on error
      console.log(); // Add blank line after error output
    }
  }
}

export function createInstallCommand() {
  const command = new Command('install');

  command.description('Install ARK components using Helm').action(async () => {
    await installArk();
  });

  return command;
}
