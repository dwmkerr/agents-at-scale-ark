import {Command} from 'commander';
import chalk from 'chalk';
import {execa} from 'execa';
import inquirer from 'inquirer';
import {isCommandAvailable} from '../../lib/commandUtils.js';
import {getClusterInfo} from '../../lib/cluster.js';
import output from '../../lib/output.js';
import {getInstallableServices, arkDependencies} from '../../arkServices.js';
import {isArkReady} from '../../lib/arkStatus.js';
import ora from 'ora';

export async function installArk(options: { yes?: boolean; waitForReady?: string } = {}) {
  // Validate that --wait-for-ready requires -y
  if (options.waitForReady && !options.yes) {
    output.error('--wait-for-ready requires -y flag for non-interactive mode');
    process.exit(1);
  }

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

  // If not using -y flag, show checklist interface
  if (!options.yes) {
    console.log(chalk.cyan.bold('\nSelect components to install:'));
    console.log(chalk.gray('Use arrow keys to navigate, space to toggle, enter to confirm\n'));

    // Build choices for the checkbox prompt
    const allChoices = [
      new inquirer.Separator(chalk.bold('──── Dependencies (Required) ────')),
      {
        name: `cert-manager ${chalk.gray('- Certificate management')} ${chalk.red('*')}`,
        value: 'cert-manager',
        checked: true,
        disabled: 'Required',
      },
      {
        name: `gateway-api ${chalk.gray('- Gateway API CRDs')} ${chalk.red('*')}`,
        value: 'gateway-api',
        checked: true,
        disabled: 'Required',
      },
      new inquirer.Separator(chalk.bold('──── ARK Core (Required) ────')),
      {
        name: `ark-controller ${chalk.gray('- Core ARK controller')} ${chalk.red('*')}`,
        value: 'ark-controller',
        checked: true,
        disabled: 'Required',
      },
      new inquirer.Separator(chalk.bold('──── ARK Services ────')),
      {
        name: `ark-api ${chalk.gray('- API service')}`,
        value: 'ark-api',
        checked: true,
      },
      {
        name: `ark-dashboard ${chalk.gray('- Web dashboard')}`,
        value: 'ark-dashboard',
        checked: true,
      },
      {
        name: `ark-mcp ${chalk.gray('- MCP services')}`,
        value: 'ark-mcp',
        checked: true,
      },
      {
        name: `localhost-gateway ${chalk.gray('- Gateway for local access')}`,
        value: 'localhost-gateway',
        checked: true,
      },
    ];

    let selectedComponents: string[] = [];
    try {
      const answers = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'components',
          message: 'Components to install:',
          choices: allChoices,
          pageSize: 15,
        },
      ]);
      selectedComponents = answers.components;

      // Always ensure required components are included
      const requiredComponents = ['cert-manager', 'gateway-api', 'ark-controller'];
      for (const required of requiredComponents) {
        if (!selectedComponents.includes(required)) {
          selectedComponents.push(required);
        }
      }

      if (selectedComponents.length === 0) {
        output.warning('No components selected. Exiting.');
        process.exit(0);
      }
    } catch (error) {
      // Handle Ctrl-C gracefully
      if (error && (error as any).name === 'ExitPromptError') {
        console.log('\nInstallation cancelled');
        process.exit(130);
      }
      throw error;
    }

    // Install dependencies if selected
    const shouldInstallDeps = selectedComponents.includes('cert-manager') ||
                             selectedComponents.includes('gateway-api');

    // Install selected dependencies
    if (shouldInstallDeps) {
      // Always install cert-manager repo and update if installing any dependency
      if (selectedComponents.includes('cert-manager') || selectedComponents.includes('gateway-api')) {
        for (const depKey of ['cert-manager-repo', 'helm-repo-update']) {
          const dep = arkDependencies[depKey];
          output.info(`installing ${dep.description || dep.name}...`);
          try {
            await execa(dep.command, dep.args, {
              stdio: 'inherit',
            });
            output.success(`${dep.name} completed`);
            console.log();
          } catch {
            console.log();
            process.exit(1);
          }
        }
      }

      // Install cert-manager if selected
      if (selectedComponents.includes('cert-manager')) {
        const dep = arkDependencies['cert-manager'];
        output.info(`installing ${dep.description || dep.name}...`);
        try {
          await execa(dep.command, dep.args, {
            stdio: 'inherit',
          });
          output.success(`${dep.name} completed`);
          console.log();
        } catch {
          console.log();
          process.exit(1);
        }
      }

      // Install gateway-api if selected
      if (selectedComponents.includes('gateway-api')) {
        const dep = arkDependencies['gateway-api-crds'];
        output.info(`installing ${dep.description || dep.name}...`);
        try {
          await execa(dep.command, dep.args, {
            stdio: 'inherit',
          });
          output.success(`${dep.name} completed`);
          console.log();
        } catch {
          console.log();
          process.exit(1);
        }
      }
    }

    // Install selected services
    const services = getInstallableServices();
    for (const service of Object.values(services)) {
      // Check if this service was selected
      const serviceKey = service.helmReleaseName;
      if (!selectedComponents.includes(serviceKey)) {
        continue;
      }

      output.info(`installing ${service.name}...`);
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
  } else {
    // -y flag was used, install everything
    // Install all dependencies
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

    // Install all services
    const services = getInstallableServices();
    for (const service of Object.values(services)) {
      output.info(`installing ${service.name}...`);

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
  }

  // Wait for ARK to be ready if requested
  if (options.waitForReady) {
    // Parse timeout value (e.g., '30s', '2m', '60')
    const parseTimeout = (value: string): number => {
      const match = value.match(/^(\d+)([sm])?$/);
      if (!match) {
        throw new Error('Invalid timeout format. Use format like 30s or 2m');
      }
      const num = parseInt(match[1], 10);
      const unit = match[2] || 's';
      return unit === 'm' ? num * 60 : num;
    };

    try {
      const timeoutSeconds = parseTimeout(options.waitForReady);
      const startTime = Date.now();
      const endTime = startTime + timeoutSeconds * 1000;

      const spinner = ora(`Waiting for ARK to be ready (timeout: ${timeoutSeconds}s)...`).start();

      while (Date.now() < endTime) {
        if (await isArkReady()) {
          spinner.succeed('ARK is ready!');
          return;
        }

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        spinner.text = `Waiting for ARK to be ready (${elapsed}/${timeoutSeconds}s)...`;

        // Wait 2 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Timeout reached
      spinner.fail(`ARK did not become ready within ${timeoutSeconds} seconds`);
      process.exit(1);
    } catch (error) {
      output.error(`Failed to wait for ready: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  }
}

export function createInstallCommand() {
  const command = new Command('install');

  command
    .description('Install ARK components using Helm')
    .option('-y, --yes', 'automatically confirm all installations')
    .option('--wait-for-ready <timeout>', 'wait for ARK to be ready after installation (e.g., 30s, 2m)')
    .action(async (options) => {
      await installArk(options);
    });

  return command;
}
