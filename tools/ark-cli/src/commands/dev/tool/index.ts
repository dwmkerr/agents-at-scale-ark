import {Command} from 'commander';
import {createCheckCommand} from './check.js';
import {createInitCommand} from './init.js';
import {createGenerateCommand} from './generate.js';
import {createCleanCommand} from './clean.js';

export function createToolCommand(): Command {
  const toolCommand = new Command('tool');
  toolCommand.description('MCP tool development utilities');

  toolCommand.addCommand(createCheckCommand());
  toolCommand.addCommand(createInitCommand());
  toolCommand.addCommand(createGenerateCommand());
  toolCommand.addCommand(createCleanCommand());

  return toolCommand;
}
