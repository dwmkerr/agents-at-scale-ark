import {Command} from 'commander';
import chalk from 'chalk';
import path from 'path';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs';
import yaml from 'yaml';
import output from '../../../lib/output.js';
import {ArkDevToolAnalyzer} from '../../../lib/dev/tools/analyzer.js';
import {generateProjectFiles} from './shared.js';

async function initTool(toolPath: string) {
  const absolutePath = path.resolve(toolPath);
  const analyzer = new ArkDevToolAnalyzer();

  // Check if .ark.yaml already exists
  const arkConfigPath = path.join(absolutePath, '.ark.yaml');
  if (fs.existsSync(arkConfigPath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: chalk.yellow('.ark.yaml already exists. Overwrite?'),
        default: false
      }
    ]);

    if (!overwrite) {
      console.log(chalk.gray('Initialization cancelled'));
      return;
    }
  }

  // Initialize configuration object
  const arkConfig: any = {
    version: '1.0',
    project: {}
  };

  // Step 1: Check if path exists and is a directory
  const checkSpinner = ora('Checking project path...').start();
  const project = await analyzer.discoverProject(absolutePath);

  if (!project || !project.exists) {
    checkSpinner.fail('Path not found');
    output.error(`Path not found: ${absolutePath}`);
    process.exit(1);
  }

  if (!project.is_directory) {
    checkSpinner.fail('Path is not a directory');
    output.error(`Path is not a directory: ${absolutePath}`);
    process.exit(1);
  }

  checkSpinner.succeed('Project path verified');
  arkConfig.project.path = absolutePath;

  // Step 2: Detect platform
  console.log();
  if (!project.platform) {
    console.log(chalk.yellow('⚠ No Python project files found (pyproject.toml or requirements.txt)'));
    const { continueWithoutProject } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueWithoutProject',
        message: 'Continue without project files?',
        default: false
      }
    ]);

    if (!continueWithoutProject) {
      console.log(chalk.gray('Initialization cancelled'));
      return;
    }

    // Set defaults but don't create anything
    arkConfig.project.platform = 'python3';
    arkConfig.project.type = 'none';
  } else {
    console.log(chalk.green(`✓ Detected platform: ${chalk.white(project.platform)}`));
    console.log(chalk.gray(`  Found from: ${project.project_type === 'pyproject' ? 'pyproject.toml' : 'requirements.txt'}`));

    const { confirmPlatform } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmPlatform',
        message: `Confirm platform is ${project.platform}?`,
        default: true
      }
    ]);

    if (!confirmPlatform) {
      console.log(chalk.gray('Initialization cancelled'));
      return;
    }

    arkConfig.project.platform = project.platform;
    arkConfig.project.type = project.project_type;

    // Step 3: Project metadata
    if (project.project_name) {
      console.log();
      console.log(chalk.green(`✓ Found project name: ${chalk.white(project.project_name)}`));
      console.log(chalk.gray(`  From: pyproject.toml [project.name]`));

      const { confirmName } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmName',
          message: `Save project name as "${project.project_name}"?`,
          default: true
        }
      ]);

      if (confirmName) {
        arkConfig.project.name = project.project_name;
      }

      if (project.project_version) {
        console.log();
        console.log(chalk.green(`✓ Found project version: ${chalk.white(project.project_version)}`));
        console.log(chalk.gray(`  From: pyproject.toml [project.version]`));

        const { confirmVersion } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmVersion',
            message: `Save project version as "${project.project_version}"?`,
            default: true
          }
        ]);

        if (confirmVersion) {
          arkConfig.project.version = project.project_version;
        }
      }
    }

    // Step 4: Check for FastMCP
    console.log();
    if (project.has_fastmcp) {
      console.log(chalk.green(`✓ Found FastMCP framework: ${chalk.white(`v${project.fastmcp_version || 'unknown'}`)}`));
      console.log(chalk.gray(`  From: ${project.project_type === 'pyproject' ? 'pyproject.toml dependencies' : 'requirements.txt'}`));

      const { confirmFramework } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmFramework',
          message: `Save framework as FastMCP v${project.fastmcp_version}?`,
          default: true
        }
      ]);

      if (confirmFramework) {
        arkConfig.project.framework = 'fastmcp';
        arkConfig.project.frameworkVersion = project.fastmcp_version;
      }
    } else {
      console.log(chalk.yellow('⚠ FastMCP not found in dependencies'));
      console.log(chalk.gray(`  Checked: ${project.project_type === 'pyproject' ? 'pyproject.toml' : 'requirements.txt'}`));

      const { recordMissing } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'recordMissing',
          message: 'Record that FastMCP is not installed?',
          default: true
        }
      ]);

      if (recordMissing) {
        arkConfig.project.framework = 'none';
      }
    }
  }

  // Step 5: MCP Transport Configuration (only if FastMCP is detected)
  if (arkConfig.project.framework === 'fastmcp') {
    // Try to detect transport from existing code
    let detectedTransport = null;
    const pythonFiles = fs.readdirSync(absolutePath).filter(f => f.endsWith('.py'));

    for (const file of pythonFiles) {
      const content = fs.readFileSync(path.join(absolutePath, file), 'utf-8');
      if (content.includes('transport="sse"')) {
        detectedTransport = 'sse';
        break;
      } else if (content.includes('transport="http"')) {
        detectedTransport = 'http';
        break;
      } else if (content.includes('transport="stdio"') || content.includes('.run()')) {
        detectedTransport = 'stdio';
        break;
      }
    }

    if (detectedTransport) {
      console.log(chalk.green(`✓ MCP: Detected transport ${chalk.white(detectedTransport)}`));

      const { confirmTransport } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmTransport',
          message: `Use transport "${detectedTransport}"?`,
          default: true
        }
      ]);

      if (confirmTransport) {
        arkConfig.mcp = { transport: detectedTransport };
      }
    }

    // If not detected or not confirmed, ask
    if (!arkConfig.mcp) {
      const { transport } = await inquirer.prompt([
        {
          type: 'list',
          name: 'transport',
          message: 'Select MCP transport for deployment:',
          choices: [
            {
              name: 'SSE (Server-Sent Events) - Recommended for Kubernetes',
              value: 'sse',
              short: 'SSE'
            },
            {
              name: 'HTTP - Stateless request/response',
              value: 'http',
              short: 'HTTP'
            },
            {
              name: 'STDIO - Standard input/output for CLI tools',
              value: 'stdio',
              short: 'STDIO'
            }
          ],
          default: 'sse'
        }
      ]);

      arkConfig.mcp = { transport };
    }

    // Ask for port if not stdio
    if (arkConfig.mcp.transport !== 'stdio') {
      const { port } = await inquirer.prompt([
        {
          type: 'input',
          name: 'port',
          message: 'MCP server port:',
          default: '8080',
          validate: (input) => {
            const num = parseInt(input);
            if (isNaN(num) || num < 1 || num > 65535) {
              return 'Please enter a valid port number (1-65535)';
            }
            return true;
          }
        }
      ]);

      arkConfig.mcp.port = parseInt(port);

      // Show configuration snippet
      console.log();
      console.log(chalk.yellow('📝 Add this to your MCP server code:'));
      console.log(chalk.gray('─'.repeat(40)));

      if (arkConfig.mcp.transport === 'sse') {
        console.log(chalk.green(`if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", "${arkConfig.mcp.port}"))
    mcp.run(transport="sse", host="0.0.0.0", port=port)`));
      } else if (arkConfig.mcp.transport === 'http') {
        console.log(chalk.green(`if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", "${arkConfig.mcp.port}"))
    mcp.run(transport="http", host="0.0.0.0", port=port, path="/")`));
      }

      console.log(chalk.gray('─'.repeat(40)));
      console.log(chalk.dim('The PORT environment variable will be set by Kubernetes'));
    }
  }

  // Step 6: Write .ark.yaml
  console.log();
  const writeSpinner = ora('Writing .ark.yaml configuration...').start();

  try {
    const yamlContent = yaml.stringify(arkConfig);
    fs.writeFileSync(arkConfigPath, yamlContent, 'utf-8');
    writeSpinner.succeed('.ark.yaml created successfully');

    console.log();
    console.log(chalk.blue('Configuration Summary:'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(`Platform:  ${arkConfig.project.platform}`);
    console.log(`Type:      ${arkConfig.project.type}`);
    if (arkConfig.project.name) {
      console.log(`Name:      ${arkConfig.project.name}`);
      console.log(`Version:   ${arkConfig.project.version || 'unknown'}`);
    }
    if (arkConfig.project.framework) {
      console.log(`Framework: ${arkConfig.project.framework}`);
    }
    if (arkConfig.mcp) {
      console.log(`Transport: ${arkConfig.mcp.transport}`);
      if (arkConfig.mcp.port) {
        console.log(`Port:      ${arkConfig.mcp.port}`);
      }
    }
    console.log(chalk.gray('─'.repeat(40)));

    console.log();
    console.log(chalk.green('✓ Initialization complete!'));

    // Step 6: Ask about generating project files
    console.log();
    const { generateFiles } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'generateFiles',
        message: 'Generate project files (Dockerfile, .dockerignore, etc.)?',
        default: true
      }
    ]);

    if (generateFiles) {
      console.log();
      await generateProjectFiles(absolutePath, {interactive: true, dryRun: false, overwrite: false});
    }

    console.log();
    console.log('  • Edit ' + chalk.cyan('.ark.yaml') + ' to update configuration');

  } catch (error) {
    writeSpinner.fail('Failed to write .ark.yaml');
    output.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

export function createInitCommand(): Command {
  const initCommand = new Command('init');
  initCommand
    .description('Initialize an MCP tool project with .ark.yaml configuration')
    .argument('<path>', 'Path to the tool directory')
    .action(initTool);

  return initCommand;
}