import {Command} from 'commander';
import {createToolCommand} from './tool.js';

export function createDevCommand(): Command {
  const devCommand = new Command('dev');
  devCommand.description('Development tools for ARK');

  // Add subcommands
  devCommand.addCommand(createToolCommand());

  return devCommand;
}
