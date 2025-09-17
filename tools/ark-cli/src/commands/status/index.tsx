import {Command} from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {StatusChecker} from '../../components/statusChecker.js';
import {ConfigManager} from '../../config.js';
import {ArkClient} from '../../lib/arkClient.js';
import {StatusFormatter} from '../../ui/statusFormatter.js';

export async function checkStatus() {
  const spinner = ora('Checking system status').start();

  try {
    const configManager = new ConfigManager();

    spinner.text = 'Checking system dependencies';
    const apiBaseUrl = await configManager.getApiBaseUrl();
    const arkClient = new ArkClient(apiBaseUrl);
    const statusChecker = new StatusChecker(arkClient);

    spinner.text = 'Testing cluster access';

    spinner.text = 'Checking ARK services';
    const statusData = await statusChecker.checkAll();

    spinner.stop();

    StatusFormatter.printStatus(statusData);
    process.exit(0);
  } catch (error) {
    spinner.fail('Failed to check status');
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}

export function createStatusCommand(): Command {
  const statusCommand = new Command('status');
  statusCommand.description('Check ARK system status').action(checkStatus);

  return statusCommand;
}
