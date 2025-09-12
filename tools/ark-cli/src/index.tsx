#!/usr/bin/env NODE_NO_WARNINGS=1 node

import {Command} from 'commander';
import {render} from 'ink';
import {createRequire} from 'module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

import output from './lib/output.js';
import {createAgentsCommand} from './commands/agents/index.js';
import {createChatCommand} from './commands/chat.js';
import {createClusterCommand} from './commands/cluster/index.js';
import {createCompletionCommand} from './commands/completion.js';
import {createDashboardCommand} from './commands/dashboard.js';
import {createGenerateCommand} from './commands/generate/index.js';
import {createInstallCommand} from './commands/install.js';
import {createUninstallCommand} from './commands/uninstall.js';
import {createStatusCommand} from './commands/status.js';
import {createConfigCommand} from './commands/config.js';
import {createTargetsCommand} from './commands/targets.js';
import {createRoutesCommand} from './commands/routes.js';
import MainMenu from './ui/MainMenu.js';

function showMainMenu() {
  const app = render(<MainMenu />);
  // Store app instance globally so MainMenu can access it
  interface GlobalWithInkApp {
    inkApp?: ReturnType<typeof render>;
  }
  (globalThis as GlobalWithInkApp).inkApp = app;
}

async function main() {
  const program = new Command();
  program
    .name(packageJson.name)
    .description(packageJson.description)
    .version(packageJson.version);

  program.addCommand(createAgentsCommand());
  program.addCommand(createChatCommand());
  program.addCommand(createClusterCommand());
  program.addCommand(createCompletionCommand());
  program.addCommand(createDashboardCommand());
  program.addCommand(createGenerateCommand());
  program.addCommand(createInstallCommand());
  program.addCommand(createUninstallCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createConfigCommand());
  program.addCommand(createTargetsCommand());
  program.addCommand(createRoutesCommand());

  // If no args provided, show interactive menu
  if (process.argv.length === 2) {
    showMainMenu();
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  output.error('failed to start ark cli: ', error);
  process.exit(1);
});
