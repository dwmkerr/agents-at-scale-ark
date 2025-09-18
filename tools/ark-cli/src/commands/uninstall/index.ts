import {Command} from 'commander';
import chalk from 'chalk';
import {execa} from 'execa';
import inquirer from 'inquirer';
import type {ArkConfig} from '../../lib/config.js';
import {getClusterInfo} from '../../lib/cluster.js';
import output from '../../lib/output.js';
import {getInstallableServices} from '../../arkServices.js';

async function uninstallService(service: any) {
  const helmArgs = [
    'uninstall',
    service.helmReleaseName,
    '--ignore-not-found',
  ];

  // Only add namespace flag if service has explicit namespace
  if (service.namespace) {
    helmArgs.push('--namespace', service.namespace);
  }

  await execa('helm', helmArgs, { stdio: 'inherit' });
}

async function uninstallArk(serviceName?: string, options: { yes?: boolean } = {}) {
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

  // If a specific service is requested, uninstall only that service
  if (serviceName) {
    const services = getInstallableServices();
    const service = Object.values(services).find(s => s.name === serviceName);

    if (!service) {
      output.error(`service '${serviceName}' not found`);
      output.info('available services:');
      for (const s of Object.values(services)) {
        output.info(`  ${s.name}`);
      }
      process.exit(1);
    }

    output.info(`uninstalling ${service.name}...`);
    try {
      await uninstallService(service);
      output.success(`${service.name} uninstalled successfully`);
    } catch (error) {
      output.error(`failed to uninstall ${service.name}`);
      console.error(error);
      process.exit(1);
    }
    return;
  }

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
      await uninstallService(service);
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
    .argument('[service]', 'specific service to uninstall, or all if omitted')
    .option('-y, --yes', 'automatically confirm all uninstallations')
    .action(async (service, options) => {
      await uninstallArk(service, options);
    });

  return command;
}
