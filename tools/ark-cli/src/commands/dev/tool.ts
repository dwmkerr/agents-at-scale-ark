import {Command} from 'commander';
import chalk from 'chalk';
import path from 'path';
import {fileURLToPath} from 'url';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs';
import yaml from 'yaml';
import {execSync} from 'child_process';
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

async function generateProjectFiles(toolPath: string, options: {interactive?: boolean} = {interactive: true}) {
  const absolutePath = path.resolve(toolPath);
  const arkConfigPath = path.join(absolutePath, '.ark.yaml');

  // Check if .ark.yaml exists
  if (!fs.existsSync(arkConfigPath)) {
    output.error('.ark.yaml not found. Run "ark dev tool init" first.');
    process.exit(1);
  }

  // Load .ark.yaml
  const arkConfig = yaml.parse(fs.readFileSync(arkConfigPath, 'utf-8'));

  const generateSpinner = ora('Generating project files...').start();

  try {
    // Find template directory - templates are in the source tree
    const currentFile = fileURLToPath(import.meta.url);
    const distDir = path.dirname(path.dirname(path.dirname(currentFile))); // Goes to dist/
    const arkCliDir = path.dirname(distDir); // Goes to ark-cli/
    const templateDir = path.join(arkCliDir, 'samples', 'templates', 'python-mcp-tool');

    if (!fs.existsSync(templateDir)) {
      generateSpinner.fail('Template directory not found');
      console.log(chalk.yellow('Could not find templates at: ' + templateDir));
      return false;
    }

    // Find all .template files
    const templateFiles = fs.readdirSync(templateDir)
      .filter(f => f.includes('.template'));

    let generatedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const templateFile of templateFiles) {
      // Extract target filename (remove .template suffix)
      const targetFile = templateFile.replace('.template', '');
      const targetPath = path.join(absolutePath, targetFile);

      // Check if file already exists
      if (fs.existsSync(targetPath)) {
        if (options.interactive) {
          console.log(chalk.yellow(`  Skipping ${targetFile} (already exists)`));
        }
        skippedCount++;
        continue;
      }

      try {
        // Prepare values for templating
        const values = {
          name: arkConfig.project?.name || path.basename(absolutePath),
          type: arkConfig.project?.type || 'pyproject',
          platform: arkConfig.project?.platform || 'python3',
          version: arkConfig.project?.version || '0.1.0',
          framework: arkConfig.project?.framework || 'fastmcp'
        };

        // Create temp values file for helm
        const tempValuesFile = path.join(absolutePath, '.ark-template-values.yaml');
        fs.writeFileSync(tempValuesFile, yaml.stringify(values));

        // Read template and render it
        const templatePath = path.join(templateDir, templateFile);
        let content = fs.readFileSync(templatePath, 'utf-8');

        // For YAML files (like devspace.yaml), use helm
        if (targetFile.endsWith('.yaml') || targetFile.endsWith('.yml')) {
          // Create a minimal Chart.yaml for helm
          const tempChartDir = path.join(absolutePath, '.ark-helm-temp');
          const tempTemplatesDir = path.join(tempChartDir, 'templates');
          fs.mkdirSync(tempChartDir, { recursive: true });
          fs.mkdirSync(tempTemplatesDir, { recursive: true });

          // Write minimal Chart.yaml
          fs.writeFileSync(path.join(tempChartDir, 'Chart.yaml'), 'apiVersion: v2\nname: temp\nversion: 0.1.0\n');

          // Copy template to templates dir
          const helmTemplateName = 'file.yaml';
          fs.copyFileSync(templatePath, path.join(tempTemplatesDir, helmTemplateName));

          // Run helm template
          const helmCommand = `helm template temp ${tempChartDir} --values ${tempValuesFile} -s templates/${helmTemplateName}`;

          try {
            content = execSync(helmCommand, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
            // Remove the YAML document separator and any helm metadata
            content = content.replace(/^---\n/, '');
            content = content.replace(/^# Source:.*\n/gm, '');
          } catch (helmError) {
            // Fall back to simple templating if helm fails
            if (options.interactive) {
              console.log(chalk.yellow(`  Helm failed for ${targetFile}, using simple templating`));
            }
          } finally {
            // Clean up temp helm chart
            fs.rmSync(tempChartDir, { recursive: true, force: true });
          }
        }

        // For non-YAML files or if helm failed, use simple templating
        if (!targetFile.endsWith('.yaml') && !targetFile.endsWith('.yml') || content === fs.readFileSync(templatePath, 'utf-8')) {
          // Simple template replacement
          content = content.replace(/\{\{\s*\.name\s*\}\}/g, values.name);
          content = content.replace(/\{\{\s*\.type\s*\}\}/g, values.type);
          content = content.replace(/\{\{\s*\.platform\s*\}\}/g, values.platform);
          content = content.replace(/\{\{\s*\.version\s*\}\}/g, values.version);
          content = content.replace(/\{\{\s*\.framework\s*\}\}/g, values.framework);

          // Handle conditional blocks for pyproject vs requirements
          if (values.type === 'pyproject') {
            // Keep if block, remove else block
            content = content.replace(/\{\{\s*if\s+eq\s+\.type\s+"pyproject"\s*-?\}\}([\s\S]*?)\{\{-?\s*else\s*-?\}\}[\s\S]*?\{\{-?\s*end\s*\}\}/g, '$1');
          } else {
            // Keep else block, remove if block
            content = content.replace(/\{\{\s*if\s+eq\s+\.type\s+"pyproject"\s*-?\}\}[\s\S]*?\{\{-?\s*else\s*-?\}\}([\s\S]*?)\{\{-?\s*end\s*\}\}/g, '$1');
          }

          // Remove any standalone if blocks that don't match
          content = content.replace(/\{\{\s*if\s+.*?\}\}[\s\S]*?\{\{-?\s*end\s*\}\}/g, '');
        }

        // Write the rendered file
        fs.writeFileSync(targetPath, content);

        // Clean up temp values file
        if (fs.existsSync(tempValuesFile)) {
          fs.unlinkSync(tempValuesFile);
        }

        if (options.interactive) {
          console.log(chalk.green(`  ✓ Generated ${targetFile}`));
        }
        generatedCount++;

      } catch (err) {
        errors.push(`${targetFile}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    if (generatedCount > 0) {
      generateSpinner.succeed(`Generated ${generatedCount} file(s)`);
    } else if (skippedCount > 0) {
      generateSpinner.warn(`No new files generated (${skippedCount} already exist)`);
    } else {
      generateSpinner.warn('No files to generate');
    }

    if (errors.length > 0 && options.interactive) {
      console.log(chalk.red('Errors:'));
      errors.forEach(e => console.log(chalk.red(`  - ${e}`)));
    }

    return generatedCount > 0;

  } catch (error) {
    generateSpinner.fail('Failed to generate project files');
    if (options.interactive) {
      console.log(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
    return false;
  }
}

async function generateTool(toolPath: string) {
  const absolutePath = path.resolve(toolPath);

  console.log();
  console.log(chalk.blue('ARK Tool Project File Generation'));
  console.log();

  const success = await generateProjectFiles(absolutePath);

  if (success) {
    console.log();
    console.log('Next steps:');
    console.log('  • Review generated files and customize as needed');
    console.log('  • Build Docker image: ' + chalk.cyan('docker build -t my-tool .'));
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
      console.log(chalk.gray(`  From: pyproject.toml [project] section`));

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
        console.log(chalk.gray(`  From: pyproject.toml [project] section`));

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

  // Step 5: Write .ark.yaml
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
      await generateProjectFiles(absolutePath);
    }

    console.log();
    console.log('Next steps:');
    console.log('  • Edit ' + chalk.cyan('.ark.yaml') + ' to update configuration');
    if (generateFiles) {
      console.log('  • Review generated files and customize as needed');
    }

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

  const generateCommand = new Command('generate');
  generateCommand
    .description('Generate project files (Dockerfile, .dockerignore, etc.) from templates')
    .argument('<path>', 'Path to the tool directory')
    .action(generateTool);

  toolCommand.addCommand(statusCommand);
  toolCommand.addCommand(initCommand);
  toolCommand.addCommand(generateCommand);

  return toolCommand;
}
