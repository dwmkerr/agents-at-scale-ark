import {Command} from 'commander';
import chalk from 'chalk';
import {StatusChecker} from '../components/statusChecker.js';
import {ConfigManager} from '../config.js';
import {ArkClient} from '../lib/arkClient.js';
import {StatusFormatter} from '../ui/statusFormatter.js';

export async function checkStatus() {
  try {
    const configManager = new ConfigManager();
    const apiBaseUrl = await configManager.getApiBaseUrl();
    const serviceUrls = await configManager.getServiceUrls();
    const arkClient = new ArkClient(apiBaseUrl);
    const statusChecker = new StatusChecker(arkClient);

    // Check status
    const statusData = await statusChecker.checkAll(serviceUrls, apiBaseUrl);

    // Print formatted status
    StatusFormatter.printStatus(statusData);

    // Exit cleanly
    process.exit(0);
  } catch (error) {
    console.error(chalk.red('Failed to check status:'), error);
    process.exit(1);
  }
}

export function createStatusCommand(): Command {
  const statusCommand = new Command('status');
  statusCommand.description('Check ARK system status').action(checkStatus);

  return statusCommand;
}
