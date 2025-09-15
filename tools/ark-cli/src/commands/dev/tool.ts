import {Command} from 'commander';
import chalk from 'chalk';
import path from 'path';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs';
import yaml from 'yaml';
import output from '../../lib/output.js';
import {ArkDevToolAnalyzer} from '../../lib/dev/tools/analyzer.js';
import {toMCPTool} from '../../lib/dev/tools/mcp-types.js';

async function statusTool(toolPath: string, options: {output?: string}) {
  const absolutePath = path.resolve(toolPath);
  const analyzer = new ArkDevToolAnalyzer();
  const isJson = options.output === 'json';
  
  // Build up result object as we go
  const result: any = {
    path: absolutePath,
    projectRoot: null,
    error: null,
    platform: null,
    projectType: null,
    projectName: null,
    projectVersion: null,
    hasFastmcp: false,
    fastmcpVersion: null,
    tools: [],
    toolDiscoveryError: null
  };
  
  if (!isJson) {
    console.log();
  }
  
  // Single spinner for all analysis (skip for JSON output)
  const analyzeSpinner = isJson ? null : ora(`analyzing ${absolutePath}`).start();
  
  // Small delay to let user see what's happening (skip for JSON)
  if (!isJson) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Collect all information
  const project = await analyzer.discoverProject(absolutePath);
  
  if (!project || !project.exists) {
    result.error = 'path not found';
    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      analyzeSpinner!.stop();
      output.error(`path not found: ${absolutePath}`);
    }
    process.exit(1);
  }
  
  if (!project.is_directory) {
    result.error = 'path is not a directory';
    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      analyzeSpinner!.stop();
      output.error(`path is not a directory: ${absolutePath}`);
    }
    process.exit(1);
  }
  
  if (!project.platform) {
    result.error = 'platform unknown - no pyproject.toml or requirements.txt found';
    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      analyzeSpinner!.stop();
      output.error(`no pyproject.toml or requirements.txt found in: ${absolutePath}`);
    }
    process.exit(1);
  }
  
  // Update result with project info
  result.platform = project.platform;
  result.projectType = project.project_type;
  result.projectName = project.project_name;
  result.projectVersion = project.project_version;
  result.hasFastmcp = project.has_fastmcp;
  result.fastmcpVersion = project.fastmcp_version;
  result.projectRoot = absolutePath; // Store the project root
  
  // Discover tools recursively in the project
  const rawTools: any[] = [];
  try {
    const projectTools = await analyzer.findProjectTools(absolutePath);
    if (projectTools && projectTools.tools) {
      rawTools.push(...projectTools.tools);
    }
  } catch (error) {
    result.toolDiscoveryError = error instanceof Error ? error.message : 'Unknown error';
  }
  
  // Store tools in the appropriate format
  result.tools = isJson ? rawTools.map(toMCPTool) : rawTools;
  
  if (isJson) {
    // Output raw JSON
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  
  analyzeSpinner!.succeed('analysis complete');
  console.log();
  
  // Display summary in cleaner format
  output.section(path.basename(absolutePath));
  
  // Platform
  output.statusCheck('found', 'platform', result.platform);
  
  // Project type with name and version in gray
  let projectDetails = '';
  if (result.projectName) {
    projectDetails = result.projectName;
    if (result.projectVersion) {
      projectDetails += ` v${result.projectVersion}`;
    }
  }
  output.statusCheck('found', 'project', result.projectType, projectDetails);
  
  // Framework with version in gray
  if (result.hasFastmcp) {
    const fastmcpDetails = result.fastmcpVersion ? `v${result.fastmcpVersion}` : undefined;
    output.statusCheck('found', 'framework', 'fastmcp', fastmcpDetails);
  } else {
    output.statusCheck('missing', 'framework', 'fastmcp');
  }
  
  // Tools with details
  output.statusCheck('found', 'tools', result.tools.length.toString());
  if (result.tools.length > 0) {
    for (const tool of result.tools) {
      const description = tool.docstring ? tool.docstring.split('\n')[0] : '';
      console.log(chalk.gray(`      - ${tool.name}: ${description}`));
    }
  }
}

async function initTool(toolPath: string) {
  const absolutePath = path.resolve(toolPath);
  const analyzer = new ArkDevToolAnalyzer();

  console.log();
  console.log(chalk.blue('ARK Tool Initialization'));
  console.log(chalk.gray('Analyzing project and creating .ark.yaml configuration'));
  console.log();

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
    project: {},
    tool: {}
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
      console.log(chalk.green(`✓ Project name: ${chalk.white(project.project_name)}`));
      console.log(chalk.green(`✓ Project version: ${chalk.white(project.project_version || 'unknown')}`));

      const { confirmMetadata } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmMetadata',
          message: `Save project metadata (${project.project_name} v${project.project_version})?`,
          default: true
        }
      ]);

      if (confirmMetadata) {
        arkConfig.project.name = project.project_name;
        arkConfig.project.version = project.project_version;
      }
    }

    // Step 4: Check for FastMCP
    console.log();
    if (project.has_fastmcp) {
      console.log(chalk.green(`✓ FastMCP detected: ${chalk.white(`v${project.fastmcp_version || 'unknown'}`)}`));
      const { confirmFramework } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmFramework',
          message: `Confirm framework is FastMCP v${project.fastmcp_version}?`,
          default: true
        }
      ]);

      if (confirmFramework) {
        arkConfig.tool.framework = 'fastmcp';
        arkConfig.tool.frameworkVersion = project.fastmcp_version;
      }
    } else {
      console.log(chalk.yellow('⚠ FastMCP not found in dependencies'));
      const { recordMissing } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'recordMissing',
          message: 'Record that FastMCP is not installed?',
          default: true
        }
      ]);

      if (recordMissing) {
        arkConfig.tool.framework = 'none';
      }
    }
  }

  // Step 5: Discover tools
  console.log();
  const discoverSpinner = ora('Discovering MCP tools...').start();
  const projectTools = await analyzer.findProjectTools(absolutePath);

  if (projectTools && projectTools.tools && projectTools.tools.length > 0) {
    discoverSpinner.succeed(`Found ${projectTools.tools.length} MCP tool(s)`);

    // List discovered tools
    for (const tool of projectTools.tools) {
      const description = tool.docstring ? tool.docstring.split('\n')[0] : '';
      console.log(chalk.gray(`  - ${tool.name}: ${description}`));
    }

    const { saveTools } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'saveTools',
        message: `Save discovered tools (${projectTools.tools.length} found)?`,
        default: true
      }
    ]);

    if (saveTools) {
      arkConfig.tool.discovered = projectTools.tools.map((t: any) => ({
        name: t.name,
        source: t.source_file
      }));
    }
  } else {
    discoverSpinner.warn('No MCP tools found');
    arkConfig.tool.discovered = [];
  }

  // Step 6: Additional configuration
  console.log();
  const { includeDevspace } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'includeDevspace',
      message: 'Include DevSpace configuration for Kubernetes development?',
      default: true
    }
  ]);

  if (includeDevspace) {
    arkConfig.devspace = {
      enabled: true,
      namespace: 'default'
    };
  }

  // Step 7: Write .ark.yaml
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
    if (arkConfig.tool.framework) {
      console.log(`Framework: ${arkConfig.tool.framework}`);
    }
    console.log(`Tools:     ${arkConfig.tool.discovered.length} discovered`);
    if (arkConfig.devspace?.enabled) {
      console.log(`DevSpace:  enabled`);
    }
    console.log(chalk.gray('─'.repeat(40)));

    console.log();
    console.log(chalk.green('✓ Initialization complete!'));
    console.log();
    console.log('Next steps:');
    console.log('  • Run ' + chalk.cyan('ark dev tool status .') + ' to check project status');
    console.log('  • Edit ' + chalk.cyan('.ark.yaml') + ' to update configuration');

  } catch (error) {
    writeSpinner.fail('Failed to write .ark.yaml');
    output.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

export function createToolCommand(): Command {
  const toolCommand = new Command('tool');
  toolCommand.description('MCP tool development utilities');

  const statusCommand = new Command('status');
  statusCommand
    .description('Check the status of an MCP tool project')
    .argument('<path>', 'Path to the tool directory')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(statusTool);

  const initCommand = new Command('init');
  initCommand
    .description('Initialize an MCP tool project with .ark.yaml configuration')
    .argument('<path>', 'Path to the tool directory')
    .action(initTool);

  toolCommand.addCommand(statusCommand);
  toolCommand.addCommand(initCommand);

  return toolCommand;
}
