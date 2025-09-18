import chalk from 'chalk';
import {Command} from 'commander';
import open from 'open';
import ora from 'ora';
import type {ArkConfig} from '../../lib/config.js';
import {ArkServiceProxy} from '../../lib/arkServiceProxy.js';
import {arkServices} from '../../arkServices.js';

export async function openDashboard(options: {open: boolean} = {open: true}) {
  const spinner = ora('Connecting to dashboard').start();

  try {
    const dashboardService = arkServices['ark-dashboard'];
    const proxy = new ArkServiceProxy(dashboardService, 3274); // DASH on phone keypad

    const url = await proxy.start();
    spinner.succeed('Dashboard connected');

    console.log(`ARK dashboard running on: ${chalk.green(url)}`);
    console.log(chalk.gray('Press Ctrl+C to stop'));

    if (options.open) {
      // Brief pause before opening browser
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Open browser
      await open(url);
    }

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      proxy.stop();
      process.exit(0);
    });

    // Keep process alive
    process.stdin.resume();
  } catch (error) {
    spinner.fail(
      error instanceof Error ? error.message : 'Failed to start dashboard'
    );
    process.exit(1);
  }
}

export function createDashboardCommand(_: ArkConfig): Command {
  const dashboardCommand = new Command('dashboard');
  dashboardCommand
    .description('Open the ARK dashboard in your browser')
    .option('--no-open', 'Do not open browser automatically')
    .action((options) => openDashboard(options));

  return dashboardCommand;
}
