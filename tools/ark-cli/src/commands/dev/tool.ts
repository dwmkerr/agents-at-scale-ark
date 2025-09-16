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

async function generateProjectFiles(toolPath: string, options: {interactive?: boolean, dryRun?: boolean, overwrite?: boolean} = {interactive: true, dryRun: false, overwrite: false}) {
  const absolutePath = path.resolve(toolPath);
  const arkConfigPath = path.join(absolutePath, '.ark.yaml');

  // Check if .ark.yaml exists
  if (!fs.existsSync(arkConfigPath)) {
    output.error('.ark.yaml not found. Run "ark dev tool init" first.');
    process.exit(1);
  }

  // Load .ark.yaml
  const arkConfig = yaml.parse(fs.readFileSync(arkConfigPath, 'utf-8'));

  const generateSpinner = options.dryRun ? null : ora('Generating project files...').start();

  try {
    // Find template directory - templates are in the source tree
    const currentFile = fileURLToPath(import.meta.url);
    const distDir = path.dirname(path.dirname(path.dirname(currentFile))); // Goes to dist/
    const arkCliDir = path.dirname(distDir); // Goes to ark-cli/
    const templateDir = path.join(arkCliDir, 'templates', 'python-mcp-tool');

    if (!fs.existsSync(templateDir)) {
      if (generateSpinner) {
        generateSpinner.fail('Template directory not found');
      }
      console.log(chalk.yellow('Could not find templates at: ' + templateDir));
      return false;
    }

    // Find all template files (starting with 'template.')
    const templateFiles = fs.readdirSync(templateDir)
      .filter(f => f.startsWith('template.'));

    if (options.dryRun && templateFiles.length === 0) {
      console.log(chalk.yellow('No template files found in: ' + templateDir));
      return false;
    }

    let generatedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];
    const generatedFiles: string[] = [];

    for (const templateFile of templateFiles) {
      // Extract target filename (remove 'template.' prefix)
      // Note: targetFile keeps the original name including leading dots (e.g., .dockerignore)
      const targetFile = templateFile.replace('template.', '');
      const targetPath = path.join(absolutePath, targetFile);

      // Check if file already exists (skip this check in dry-run mode or overwrite mode)
      if (!options.dryRun && !options.overwrite && fs.existsSync(targetPath)) {
        if (options.interactive) {
          console.log(chalk.yellow(`  Skipping ${targetFile} (already exists)`));
        }
        skippedCount++;
        continue;
      }

      try {
        // Prepare consistent values structure for all templates
        const projectName = arkConfig.project?.name || path.basename(absolutePath);
        const values = {
          project: {
            name: projectName,
            type: arkConfig.project?.type || 'pyproject',
            platform: arkConfig.project?.platform || 'python3',
            version: arkConfig.project?.version || '0.1.0',
            framework: arkConfig.project?.framework || 'fastmcp'
          },
          python: {
            version: '3.11',  // Default Python version
            module_name: projectName.replace(/-/g, '_')  // Convert kebab-case to snake_case
          },
          devspace: {
            namespace: 'default',
            image: {
              repository: projectName  // Default repository name
            }
          }
        };

        // Create temp values file for helm
        const tempValuesFile = path.join(absolutePath, '.ark-template-values.yaml');
        fs.writeFileSync(tempValuesFile, yaml.stringify(values));

        // Read template
        const templatePath = path.join(templateDir, templateFile);

        // Create a minimal chart structure for helm to process this single file
        const tempChartDir = path.join(absolutePath, '.ark-helm-temp');
        const tempTemplatesDir = path.join(tempChartDir, 'templates');
        fs.mkdirSync(tempChartDir, { recursive: true });
        fs.mkdirSync(tempTemplatesDir, { recursive: true });

        // Write minimal Chart.yaml
        fs.writeFileSync(path.join(tempChartDir, 'Chart.yaml'), 'apiVersion: v2\nname: temp\nversion: 0.1.0\n');

        // Copy template to templates dir
        // For non-YAML files, wrap them in a YAML structure for helm to process
        const originalTemplateName = targetFile; // This is already the target filename
        const isYamlFile = targetFile.endsWith('.yaml') || targetFile.endsWith('.yml');

        // For dotfiles, replace the leading dot with 'dot' for helm processing
        // (helm has issues with files starting with dots)
        const helmTemplateName = originalTemplateName.startsWith('.')
          ? 'dot' + originalTemplateName.substring(1)
          : originalTemplateName;

        if (isYamlFile) {
          // Copy YAML files directly
          fs.copyFileSync(templatePath, path.join(tempTemplatesDir, helmTemplateName));
        } else {
          // Wrap non-YAML content in a YAML structure for helm
          const originalContent = fs.readFileSync(templatePath, 'utf-8');
          const wrappedContent = `# Wrapped for helm processing\ncontent: |\n${originalContent.split('\n').map(line => '  ' + line).join('\n')}`;
          fs.writeFileSync(path.join(tempTemplatesDir, helmTemplateName + '.yaml'), wrappedContent);
        }

        // Run helm template to process the file
        const actualHelmFile = isYamlFile ? helmTemplateName : helmTemplateName + '.yaml';
        const helmCommand = `helm template temp ${tempChartDir} --values ${tempValuesFile} -s templates/${actualHelmFile}`;

        let content: string;
        try {
          content = execSync(helmCommand, { encoding: 'utf-8' });
          // Remove the YAML document separator that helm adds
          content = content.replace(/^---\n/, '');
          // Remove helm's source comment
          content = content.replace(/^# Source:.*\n/gm, '');

          // For non-YAML files, extract the content from the wrapped YAML
          if (!isYamlFile) {
            // Parse the YAML to extract the content field
            const yamlContent = yaml.parse(content);
            content = yamlContent.content || '';
          }
        } catch (helmError: any) {
          const errorMsg = helmError.stderr || helmError.message || 'Unknown error';
          // Debug: Check if values file exists and is readable
          if (options.dryRun) {
            console.log(chalk.yellow(`Debug: Helm command failed: ${helmCommand}`));
            console.log(chalk.yellow(`Debug: Values file exists: ${fs.existsSync(tempValuesFile)}`));
            if (fs.existsSync(tempValuesFile)) {
              console.log(chalk.yellow(`Debug: Values content:`));
              console.log(fs.readFileSync(tempValuesFile, 'utf-8'));
            }
          }
          throw new Error(`Failed to template ${targetFile}: ${errorMsg}`);
        } finally {
          // Clean up temp chart
          fs.rmSync(tempChartDir, { recursive: true, force: true });
        }

        // In dry-run mode, print to stdout; otherwise write the file
        if (options.dryRun) {
          console.log(chalk.cyan(`\n=== ${targetFile} ===`));
          console.log(content);
          console.log(chalk.cyan(`=== END ${targetFile} ===\n`));
        } else {
          fs.writeFileSync(targetPath, content);
          generatedFiles.push(targetFile);
          // Don't log individual files while spinner is active
          // We'll show them after stopping the spinner
        }

        // Clean up temp values file
        if (fs.existsSync(tempValuesFile)) {
          fs.unlinkSync(tempValuesFile);
        }

        generatedCount++;

      } catch (err) {
        const errorMsg = `${targetFile}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        errors.push(errorMsg);
        if (options.dryRun) {
          console.log(chalk.red(`Error processing ${targetFile}: ${err instanceof Error ? err.message : 'Unknown error'}`));
        }
      }
    }

    if (!options.dryRun) {
      if (generatedCount > 0) {
        generateSpinner!.succeed(`Generated ${generatedCount} file(s)`);
        // Show the generated files after stopping the spinner
        if (options.interactive && generatedFiles.length > 0) {
          generatedFiles.forEach(file => {
            console.log(chalk.green(`  ✓ Generated ${file}`));
          });
        }
      } else if (skippedCount > 0) {
        generateSpinner!.warn(`No new files generated (${skippedCount} already exist)`);
      } else {
        generateSpinner!.warn('No files to generate');
      }
    }

    if (errors.length > 0 && options.interactive) {
      console.log(chalk.red('Errors:'));
      errors.forEach(e => console.log(chalk.red(`  - ${e}`)));
    }

    return generatedCount > 0;

  } catch (error) {
    if (!options.dryRun && generateSpinner) {
      generateSpinner.fail('Failed to generate project files');
    }
    if (options.interactive) {
      console.log(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
    return false;
  }
}

async function generateTool(toolPath: string, options: {dryRun?: boolean, overwrite?: boolean} = {}) {
  const absolutePath = path.resolve(toolPath);

  if (!options.dryRun) {
    if (options.overwrite) {
      console.log(chalk.yellow('Overwrite mode: existing files will be replaced'));
    }
  }

  const success = await generateProjectFiles(absolutePath, {interactive: !options.dryRun, dryRun: options.dryRun, overwrite: options.overwrite});

  // Next steps message removed - files are ready to use
}

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
    .option('--dry-run', 'Show generated template files without creating them')
    .option('--overwrite', 'Overwrite existing files')
    .action(generateTool);

  toolCommand.addCommand(statusCommand);
  toolCommand.addCommand(initCommand);
  toolCommand.addCommand(generateCommand);

  return toolCommand;
}
