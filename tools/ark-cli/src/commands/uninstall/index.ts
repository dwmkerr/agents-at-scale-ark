import {Command} from 'commander';
import chalk from 'chalk';
import {execa} from 'execa';
import inquirer from 'inquirer';
import type {ArkConfig} from '../../lib/config.js';
import {checkCommandExists} from '../../lib/commands.js';
import {getClusterInfo} from '../../lib/cluster.js';
import output from '../../lib/output.js';
import {getInstallableServices} from '../../arkServices.js';

async function uninstallArk(options: { yes?: boolean } = {}) {
  // Check if helm is installed
  const helmInstalled = await checkCommandExists('helm', ['version', '--short']);
  if (!helmInstalled) {
    output.error('helm is not installed. please install helm first:');
    output.info('https://helm.sh/docs/intro/install/');
    process.exit(1);
  }

  // Check if kubectl is installed
  const kubectlInstalled = await checkCommandExists('kubectl', ['version', '--client']);
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

  // Get installable services and iterate through them in reverse order for clean uninstall
  const services = getInstallableServices();
  const serviceEntries = Object.entries(services).reverse();

  for (const [, service] of serviceEntries) {
    let shouldUninstall = false;

    try {
      // Ask for confirmation
      shouldUninstall = options.yes || (
        await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldUninstall',
            message: `uninstall ${chalk.bold(service.name)}? ${service.description ? chalk.gray(`(${service.description.toLowerCase()})`) : ''}`,
            default: true,
          },
        ])
      ).shouldUninstall;
    } catch (error) {
      // Handle Ctrl-C gracefully
      if (error && (error as any).name === 'ExitPromptError') {
        console.log('\nUninstallation cancelled');
        process.exit(130); // Standard exit code for SIGINT
      }
      throw error;
    }

    if (!shouldUninstall) {
      output.warning(`skipping ${service.name}`);
      continue;
    }

    try {
      // Uninstall the release
      await execa(
        'helm',
        [
          'uninstall',
          service.helmReleaseName,
          '--namespace',
          service.namespace,
          '--ignore-not-found',
        ],
        {
          stdio: 'inherit',
        }
      );

      console.log(); // Add blank line after command output
    } catch {
      // Continue with remaining charts on error
      console.log(); // Add blank line after error output
    }
  }
}

export function createUninstallCommand(_: ArkConfig) {
  const command = new Command('uninstall');

  command
    .description('Uninstall ARK components using Helm')
    .option('-y, --yes', 'automatically confirm all uninstallations')
    .action(async (options) => {
      await uninstallArk(options);
    });

  return command;
}
