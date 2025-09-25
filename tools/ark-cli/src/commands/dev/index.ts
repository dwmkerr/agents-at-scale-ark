import {Command} from 'commander';
import type {ArkConfig} from '../../lib/config.js';
import {createToolCommand} from './tool/index.js';

export function createDevCommand(_: ArkConfig): Command {
  const devCommand = new Command('dev');
  devCommand.description('Development tools for ARK');

  // Add subcommands
  devCommand.addCommand(createToolCommand());

  return devCommand;
}
