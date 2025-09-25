import {Command} from 'commander';
import chalk from 'chalk';
import path from 'path';
import {fileURLToPath} from 'url';
import fs from 'fs';
import yaml from 'yaml';
import inquirer from 'inquirer';
import output from '../../../lib/output.js';

async function cleanTool(toolPath: string, options: {yes?: boolean} = {}) {
  const absolutePath = path.resolve(toolPath);
  const arkConfigPath = path.join(absolutePath, '.ark.yaml');

  // Check if .ark.yaml exists
  if (!fs.existsSync(arkConfigPath)) {
    output.error('.ark.yaml not found. Run "ark dev tool init" first.');
    process.exit(1);
  }

  // Load .ark.yaml to validate it's parseable
  yaml.parse(fs.readFileSync(arkConfigPath, 'utf-8'));

  // Find template directory
  const currentFile = fileURLToPath(import.meta.url);
  const distDir = path.dirname(
    path.dirname(path.dirname(path.dirname(currentFile)))
  ); // Goes to dist/
  const arkCliDir = path.dirname(distDir); // Goes to ark-cli/
  const templateDir = path.join(arkCliDir, 'templates', 'python-mcp-tool');

  if (!fs.existsSync(templateDir)) {
    output.error('Template directory not found');
    process.exit(1);
  }

  // Collect all template-based files (not directories)
  const allTemplateFiles: string[] = [];
  const dirsToCheck: Set<string> = new Set();
  collectTemplateFiles(
    templateDir,
    absolutePath,
    allTemplateFiles,
    dirsToCheck
  );

  // Filter to only existing files
  const filesToClean = allTemplateFiles.filter((file) => {
    const fullPath = path.join(absolutePath, file);
    return fs.existsSync(fullPath);
  });

  if (filesToClean.length === 0) {
    console.log(chalk.green('No template-generated files found to clean.'));
    return;
  }

  console.log(
    chalk.yellow(
      `Found ${filesToClean.length} template-generated file(s) to potentially remove:`
    )
  );

  // Display the list of files
  filesToClean.forEach((file) => {
    console.log(chalk.gray(`  - ${file}`));
  });
  console.log();

  let removedCount = 0;
  let skippedCount = 0;

  // First, delete individual files
  for (const file of filesToClean) {
    const fullPath = path.join(absolutePath, file);

    // Ask for confirmation unless --yes flag is set
    let shouldDelete = options.yes;

    if (!shouldDelete) {
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'delete',
          message: `Delete file ${chalk.cyan(file)}?`,
          default: false,
        },
      ]);
      shouldDelete = answer.delete;
    }

    if (shouldDelete) {
      try {
        fs.unlinkSync(fullPath);
        console.log(chalk.green(`  ✓ Removed ${file}`));
        removedCount++;
      } catch (err) {
        console.log(
          chalk.red(
            `  ✗ Failed to remove ${file}: ${err instanceof Error ? err.message : 'Unknown error'}`
          )
        );
      }
    } else {
      console.log(chalk.gray(`  - Skipped ${file}`));
      skippedCount++;
    }
  }

  // Now check for empty directories and offer to delete them
  const sortedDirs = Array.from(dirsToCheck).sort(
    (a, b) => b.length - a.length
  ); // Process deepest dirs first

  for (const dir of sortedDirs) {
    const fullPath = path.join(absolutePath, dir);

    // Check if directory exists and is empty
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      const contents = fs.readdirSync(fullPath);

      if (contents.length === 0) {
        // Directory is empty, ask to delete it
        let shouldDelete = options.yes;

        if (!shouldDelete) {
          const answer = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'delete',
              message: `Delete empty directory ${chalk.cyan(dir)}?`,
              default: false,
            },
          ]);
          shouldDelete = answer.delete;
        }

        if (shouldDelete) {
          try {
            fs.rmdirSync(fullPath);
            console.log(chalk.green(`  ✓ Removed empty directory ${dir}`));
          } catch (err) {
            console.log(
              chalk.red(
                `  ✗ Failed to remove directory ${dir}: ${err instanceof Error ? err.message : 'Unknown error'}`
              )
            );
          }
        } else {
          console.log(chalk.gray(`  - Kept empty directory ${dir}`));
        }
      }
    }
  }

  console.log();
  if (removedCount > 0) {
    console.log(chalk.green(`✓ Removed ${removedCount} file(s)`));
  }
  if (skippedCount > 0) {
    console.log(chalk.gray(`Skipped ${skippedCount} file(s)`));
  }
}

function collectTemplateFiles(
  sourceDir: string,
  targetDir: string,
  files: string[],
  dirsToCheck: Set<string>,
  relativePath: string = ''
) {
  const entries = fs.readdirSync(sourceDir, {withFileTypes: true});

  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Track directory for later checking
      const dirPath = path.join(relativePath, entry.name);
      dirsToCheck.add(dirPath);

      // Recursively collect from subdirectory
      const subSourceDir = path.join(sourceDir, entry.name);
      collectTemplateFiles(
        subSourceDir,
        targetDir,
        files,
        dirsToCheck,
        dirPath
      );
    } else {
      // Check if it's a template file
      const targetFileName = entry.name.startsWith('template.')
        ? entry.name.replace('template.', '')
        : entry.name;

      const filePath = path.join(relativePath, targetFileName);
      files.push(filePath);
    }
  }
}

export function createCleanCommand(): Command {
  const cleanCommand = new Command('clean');
  cleanCommand
    .description('Remove template-generated files from an MCP tool project')
    .argument('<path>', 'Path to the tool directory')
    .option('-y, --yes', 'Skip confirmation prompts and delete all files')
    .action(cleanTool);

  return cleanCommand;
}
