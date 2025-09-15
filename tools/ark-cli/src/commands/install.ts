import {Command} from 'commander';
import chalk from 'chalk';
import {execa} from 'execa';
import inquirer from 'inquirer';
import {isCommandAvailable} from '../lib/commandUtils.js';
import {getClusterInfo} from '../lib/cluster.js';
import output from '../lib/output.js';
import {getInstallableServices, arkDependencies} from '../arkServices.js';
import {createModel} from './models/create.js';

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
    output.info('');
    output.info('for local development, we recommend minikube:');
    output.info('• install: https://minikube.sigs.k8s.io/docs/start');
    output.info('• start cluster: minikube start');
    output.info('');
    output.info('alternatively, you can use kind or docker desktop.');
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
    for (const dep of Object.values(arkDependencies)) {
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

  // Get installable services and iterate through them
  const services = getInstallableServices();

  for (const service of Object.values(services)) {
    // Ask for confirmation
    const {shouldInstall} = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldInstall',
        message: `install ${chalk.bold(service.name)}? ${service.description ? chalk.gray(`(${service.description.toLowerCase()})`) : ''}`,
        default: true,
      },
    ]);

    if (!shouldInstall) {
      output.warning(`skipping ${service.name}`);
      continue;
    }

    try {
      // Build helm arguments
      const helmArgs = [
        'upgrade',
        '--install',
        service.helmReleaseName,
        service.chartPath!,
        '--namespace',
        service.namespace,
      ];

      // Add any additional args from the service definition
      if (service.installArgs) {
        helmArgs.push(...service.installArgs);
      }

      // Run helm upgrade --install with streaming output
      await execa('helm', helmArgs, {
        stdio: 'inherit',
      });

      console.log(); // Add blank line after command output
    } catch {
      // Continue with remaining services on error
      console.log(); // Add blank line after error output
    }
  }

  // Check for default model after installing services
  output.info('checking for default model...');

  let modelExists = false;
  try {
    await execa('kubectl', ['get', 'model', 'default'], {stdio: 'pipe'});
    modelExists = true;
    output.success('default model already configured');
  } catch {
    output.warning('no default model found');
  }

  if (!modelExists) {
    const {shouldCreateModel} = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldCreateModel',
        message: 'would you like to create a default model?',
        default: true,
      },
    ]);

    if (shouldCreateModel) {
      await createModel('default');
    } else {
      output.warning('skipping model creation');
      output.info('you can create a model later using ark models create or the dashboard');
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
