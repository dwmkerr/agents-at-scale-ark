import {Command} from 'commander';
import chalk from 'chalk';
import path from 'path';
import {generateProjectFiles} from './shared.js';

async function generateTool(
  toolPath: string,
  options: {dryRun?: boolean; overwrite?: boolean} = {}
) {
  const absolutePath = path.resolve(toolPath);

  if (!options.dryRun) {
    if (options.overwrite) {
      console.log(
        chalk.yellow('Overwrite mode: existing files will be replaced')
      );
    }
  }

  await generateProjectFiles(absolutePath, {
    interactive: !options.dryRun,
    dryRun: options.dryRun,
    overwrite: options.overwrite,
  });

  // Next steps message removed - files are ready to use
}

export function createGenerateCommand(): Command {
  const generateCommand = new Command('generate');
  generateCommand
    .description(
      'Generate project files (Dockerfile, .dockerignore, etc.) from templates'
    )
    .argument('<path>', 'Path to the tool directory')
    .option('--dry-run', 'Show generated template files without creating them')
    .option('--overwrite', 'Overwrite existing files')
    .action(generateTool);

  return generateCommand;
}
