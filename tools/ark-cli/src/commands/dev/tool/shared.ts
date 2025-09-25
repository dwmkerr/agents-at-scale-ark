import chalk from 'chalk';
import path from 'path';
import {fileURLToPath} from 'url';
import ora from 'ora';
import fs from 'fs';
import yaml from 'yaml';
import {execSync} from 'child_process';
import output from '../../../lib/output.js';

export async function generateProjectFiles(
  toolPath: string,
  options: {interactive?: boolean; dryRun?: boolean; overwrite?: boolean} = {
    interactive: true,
    dryRun: false,
    overwrite: false,
  }
) {
  const absolutePath = path.resolve(toolPath);
  const arkConfigPath = path.join(absolutePath, '.ark.yaml');

  // Check if .ark.yaml exists
  if (!fs.existsSync(arkConfigPath)) {
    output.error('.ark.yaml not found. Run "ark dev tool init" first.');
    process.exit(1);
  }

  // Load .ark.yaml
  const arkConfig = yaml.parse(fs.readFileSync(arkConfigPath, 'utf-8'));

  const generateSpinner = options.dryRun
    ? null
    : ora('Generating project files...').start();

  try {
    // Find template directory - templates are in the source tree
    const currentFile = fileURLToPath(import.meta.url);
    const distDir = path.dirname(
      path.dirname(path.dirname(path.dirname(currentFile)))
    ); // Goes to dist/
    const arkCliDir = path.dirname(distDir); // Goes to ark-cli/
    const templateDir = path.join(arkCliDir, 'templates', 'python-mcp-tool');

    if (!fs.existsSync(templateDir)) {
      if (generateSpinner) {
        generateSpinner.fail('Template directory not found');
      }
      console.log(chalk.yellow('Could not find templates at: ' + templateDir));
      return false;
    }

    // Use a Set to track all generated items (both files and directories)
    const generatedItems = new Set<string>();
    const skippedItems = new Set<string>();
    const errors: string[] = [];

    // Process all files and directories in the template directory
    processTemplateDirectory(templateDir, absolutePath, arkConfig, options, {
      generatedItems,
      skippedItems,
      errors,
    });

    if (!options.dryRun) {
      if (generatedItems.size > 0) {
        generateSpinner!.succeed(`Generated ${generatedItems.size} file(s)`);
        // Show the generated files after stopping the spinner
        if (options.interactive && generatedItems.size > 0) {
          // Sort items for consistent display
          const sortedItems = Array.from(generatedItems).sort();
          sortedItems.forEach((item) => {
            console.log(chalk.green(`  ✓ Generated ${item}`));
          });
        }
      } else if (skippedItems.size > 0) {
        generateSpinner!.warn(
          `No new files generated (${skippedItems.size} already exist)`
        );
      } else {
        generateSpinner!.warn('No files to generate');
      }
    }

    if (errors.length > 0 && options.interactive) {
      console.log(chalk.red('Errors:'));
      errors.forEach((e) => console.log(chalk.red(`  - ${e}`)));
    }

    return generatedItems.size > 0;
  } catch (error) {
    if (!options.dryRun && generateSpinner) {
      generateSpinner.fail('Failed to generate project files');
    }
    if (options.interactive) {
      console.log(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
    return false;
  }
}

function processTemplateDirectory(
  sourceDir: string,
  targetDir: string,
  arkConfig: any,
  options: {dryRun?: boolean; overwrite?: boolean; interactive?: boolean},
  stats: {
    generatedItems: Set<string>;
    skippedItems: Set<string>;
    errors: string[];
  },
  rootTargetDir?: string
) {
  // Track the root target directory for relative path calculations
  const actualRootTargetDir = rootTargetDir || targetDir;

  // Check if this directory needs to be created
  const dirExists = fs.existsSync(targetDir);

  // Create target directory if it doesn't exist
  if (!options.dryRun && !dirExists) {
    fs.mkdirSync(targetDir, {recursive: true});
    // Track the directory creation (relative to root)
    const relativePath = path.relative(actualRootTargetDir, targetDir);
    if (relativePath) {
      // Don't add empty string for root directory
      stats.generatedItems.add(`${relativePath}/`);
    }
  }

  const entries = fs.readdirSync(sourceDir, {withFileTypes: true});

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);

    if (entry.isDirectory()) {
      // Recursively process subdirectories
      const targetSubDir = path.join(targetDir, entry.name);

      if (options.dryRun) {
        const relativePath = path.relative(actualRootTargetDir, targetSubDir);
        console.log(chalk.cyan(`\n=== ${relativePath}/ directory ===`));
        console.log(`Directory: ${entry.name}`);
        console.log(chalk.cyan(`=== END ${relativePath}/ directory ===\n`));
      }

      processTemplateDirectory(
        sourcePath,
        targetSubDir,
        arkConfig,
        options,
        stats,
        actualRootTargetDir
      );
    } else {
      // Process file - check if it's a template
      const isTemplate = entry.name.startsWith('template.');
      const targetFileName = isTemplate
        ? entry.name.replace('template.', '')
        : entry.name;
      const targetPath = path.join(targetDir, targetFileName);

      // Make target path relative to the original target directory for display
      const displayPath = path.relative(actualRootTargetDir, targetPath);

      // Check if file already exists
      const fileExists = fs.existsSync(targetPath);

      if (!options.dryRun && !options.overwrite && fileExists) {
        if (options.interactive) {
          console.log(
            chalk.yellow(`  Skipping ${displayPath} (already exists)`)
          );
        }
        stats.skippedItems.add(displayPath);
        continue;
      }

      try {
        let content: string;

        if (isTemplate) {
          // Process template file with helm - pass the actual root target directory
          content = processTemplateFile(
            sourcePath,
            targetFileName,
            arkConfig,
            options,
            actualRootTargetDir
          );
        } else {
          // Regular file, just read it
          content = fs.readFileSync(sourcePath, 'utf-8');
        }

        // In dry-run mode, print to stdout; otherwise write the file
        if (options.dryRun) {
          console.log(chalk.cyan(`\n=== ${displayPath} ===`));
          console.log(content);
          console.log(chalk.cyan(`=== END ${displayPath} ===\n`));
          stats.generatedItems.add(displayPath);
        } else {
          fs.writeFileSync(targetPath, content);
          stats.generatedItems.add(displayPath);
        }
      } catch (err) {
        const errorMsg = `${displayPath}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        stats.errors.push(errorMsg);
        if (options.dryRun) {
          console.log(
            chalk.red(
              `Error processing ${displayPath}: ${err instanceof Error ? err.message : 'Unknown error'}`
            )
          );
        }
      }
    }
  }
}

function processTemplateFile(
  templatePath: string,
  targetFileName: string,
  arkConfig: any,
  options: {dryRun?: boolean},
  rootTargetDir?: string
): string {
  // Prepare consistent values structure for all templates
  const projectName =
    arkConfig.project?.name ||
    path.basename(rootTargetDir || path.dirname(templatePath));
  const values = {
    project: {
      name: projectName,
      type: arkConfig.project?.type || 'pyproject',
      platform: arkConfig.project?.platform || 'python3',
      version: arkConfig.project?.version || '0.1.0',
      framework: arkConfig.project?.framework || 'fastmcp',
      description: arkConfig.project?.description || `${projectName} MCP tool`,
    },
    python: {
      version: '3.11', // Default Python version
      module_name: projectName.replace(/-/g, '_'), // Convert kebab-case to snake_case
    },
    mcp: {
      transport: arkConfig.mcp?.transport || 'sse', // Default to SSE for Kubernetes
      port: arkConfig.mcp?.port || 8080,
      healthCheck: arkConfig.mcp?.transport !== 'stdio', // No health checks for stdio
    },
    devspace: {
      namespace: 'default',
      image: {
        repository: projectName, // Default repository name
      },
    },
  };

  // Create temp directory for helm processing
  const tempDir = path.join('/tmp', `ark-helm-${Date.now()}`);
  const tempChartDir = path.join(tempDir, 'chart');
  const tempTemplatesDir = path.join(tempChartDir, 'templates');
  fs.mkdirSync(tempTemplatesDir, {recursive: true});

  try {
    // Write minimal Chart.yaml
    fs.writeFileSync(
      path.join(tempChartDir, 'Chart.yaml'),
      'apiVersion: v2\nname: temp\nversion: 0.1.0\n'
    );

    // Write values file
    const tempValuesFile = path.join(tempDir, 'values.yaml');
    fs.writeFileSync(tempValuesFile, yaml.stringify(values));

    // Determine if this is a YAML file
    const isYamlFile =
      targetFileName.endsWith('.yaml') || targetFileName.endsWith('.yml');

    // For dotfiles, replace the leading dot with 'dot' for helm processing
    const helmTemplateName = targetFileName.startsWith('.')
      ? 'dot' + targetFileName.substring(1)
      : targetFileName;

    if (isYamlFile) {
      // Copy YAML files directly
      fs.copyFileSync(
        templatePath,
        path.join(tempTemplatesDir, helmTemplateName)
      );
    } else {
      // Wrap non-YAML content in a YAML structure for helm
      const originalContent = fs.readFileSync(templatePath, 'utf-8');
      const wrappedContent = `# Wrapped for helm processing\ncontent: |\n${originalContent
        .split('\n')
        .map((line) => '  ' + line)
        .join('\n')}`;
      fs.writeFileSync(
        path.join(tempTemplatesDir, helmTemplateName + '.yaml'),
        wrappedContent
      );
    }

    // Run helm template to process the file
    const actualHelmFile = isYamlFile
      ? helmTemplateName
      : helmTemplateName + '.yaml';
    const helmCommand = `helm template temp ${tempChartDir} --values ${tempValuesFile} -s templates/${actualHelmFile}`;

    let content: string;
    try {
      content = execSync(helmCommand, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
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
    } catch (helmError: unknown) {
      const errorMsg =
        (helmError as {stderr?: string; message?: string}).stderr ||
        (helmError as {stderr?: string; message?: string}).message ||
        'Unknown error';
      throw new Error(`Failed to template ${targetFileName}: ${errorMsg}`);
    }

    return content;
  } finally {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, {recursive: true, force: true});
    }
  }
}
