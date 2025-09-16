import {Command} from 'commander';
import chalk from 'chalk';
import path from 'path';
import ora from 'ora';
import output from '../../../lib/output.js';
import {ArkDevToolAnalyzer} from '../../../lib/dev/tools/analyzer.js';
import {toMCPTool} from '../../../lib/dev/tools/mcp-types.js';

async function checkTool(toolPath: string, options: {output?: string}) {
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

export function createCheckCommand(): Command {
  const checkCommand = new Command('check');
  checkCommand
    .description('Check the status of an MCP tool project')
    .argument('<path>', 'Path to the tool directory')
    .option('-o, --output <format>', 'Output format (json)', 'text')
    .action(checkTool);

  return checkCommand;
}