import {execSync} from 'child_process';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {
  ArkDevToolStatus,
  DiscoveryResult,
  ProjectInfo,
  ProjectDiscoveryResult,
  DirectoryDiscoveryResult,
  FileDiscoveryResult,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ArkDevToolAnalyzer {
  private discoverToolsScript: string;

  constructor() {
    // The Python script is always adjacent to this file
    // In dev: src/lib/dev/tools/discover_tools.py
    // In prod: dist/lib/dev/tools/discover_tools.py (copied by postbuild)
    this.discoverToolsScript = path.join(__dirname, 'discover_tools.py');
  }

  /**
   * Analyze a tool directory and return its status
   */
  async analyzeToolDirectory(toolPath: string): Promise<ArkDevToolStatus> {
    const absolutePath = path.resolve(toolPath);

    // Check if path exists
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Path not found: ${absolutePath}`);
    }

    // Get project info
    const projectInfo = this.getProjectInfo(absolutePath);

    // Discover tools using Python script
    const discovery = await this.discoverTools(absolutePath);

    // Extract all tools from discovery
    const tools = this.extractTools(discovery);

    return {
      ...projectInfo,
      discovery,
      tools,
    };
  }

  /**
   * Get project information by checking for Python project files
   */
  private getProjectInfo(dirPath: string): ProjectInfo {
    const info: ProjectInfo = {
      path: dirPath,
      platform: 'python3',
      projectType: 'unknown',
      hasVenv: false,
      fastMCP: false,
    };

    // Check for virtual environment
    info.hasVenv =
      fs.existsSync(path.join(dirPath, '.venv')) ||
      fs.existsSync(path.join(dirPath, 'venv'));

    // Check Python project type and FastMCP presence
    const pyprojectPath = path.join(dirPath, 'pyproject.toml');
    const requirementsPath = path.join(dirPath, 'requirements.txt');

    if (fs.existsSync(pyprojectPath)) {
      info.projectType = 'pyproject';
      const content = fs.readFileSync(pyprojectPath, 'utf-8');
      if (content.includes('fastmcp')) {
        info.fastMCP = true;
        // Try to extract version
        const versionMatch = content.match(/fastmcp[>=<~]*([0-9.]+)/);
        if (versionMatch) {
          info.fastMCPVersion = versionMatch[1];
        }
      }
    } else if (fs.existsSync(requirementsPath)) {
      info.projectType = 'requirements';
      const content = fs.readFileSync(requirementsPath, 'utf-8');
      if (content.includes('fastmcp')) {
        info.fastMCP = true;
        const versionMatch = content.match(/fastmcp[>=<~]*([0-9.]+)/);
        if (versionMatch) {
          info.fastMCPVersion = versionMatch[1];
        }
      }
    }

    return info;
  }

  /**
   * Discover project configuration
   */
  async discoverProject(targetPath: string): Promise<ProjectDiscoveryResult | undefined> {
    try {
      // Check if Python is available
      try {
        execSync('python3 --version', {stdio: 'ignore'});
      } catch {
        console.warn('Python 3 not found');
        return undefined;
      }

      // Check if discover_tools.py exists
      if (!fs.existsSync(this.discoverToolsScript)) {
        console.warn(`discover_tools.py not found at ${this.discoverToolsScript}`);
        return undefined;
      }

      // Run the discovery script with 'project' command
      const result = execSync(`python3 "${this.discoverToolsScript}" project "${targetPath}"`, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024, // 1MB buffer
      });

      return JSON.parse(result) as ProjectDiscoveryResult;
    } catch (error) {
      console.error('Project discovery failed:', error);
      return undefined;
    }
  }

  /**
   * Discover tools using the Python script
   */
  async discoverTools(targetPath: string): Promise<DiscoveryResult | undefined> {
    try {
      // Check if Python is available
      try {
        execSync('python3 --version', {stdio: 'ignore'});
      } catch {
        console.warn('Python 3 not found, skipping tool discovery');
        return undefined;
      }

      // Check if discover_tools.py exists
      if (!fs.existsSync(this.discoverToolsScript)) {
        console.warn(`discover_tools.py not found at ${this.discoverToolsScript}`);
        return undefined;
      }

      // Run the discovery script with 'tools' command
      const result = execSync(`python3 "${this.discoverToolsScript}" tools "${targetPath}"`, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });

      return JSON.parse(result) as DiscoveryResult;
    } catch (error) {
      console.error('Tool discovery failed:', error);
      return undefined;
    }
  }


  /**
   * Recursively find all MCP tools in a project
   * This is a naive implementation that searches all Python files in the project tree
   */
  async findProjectTools(projectRoot: string): Promise<any> {
    try {
      // Check if Python is available
      try {
        execSync('python3 --version', {stdio: 'ignore'});
      } catch {
        console.warn('Python 3 not found');
        return null;
      }

      // Check if discover_tools.py exists
      if (!fs.existsSync(this.discoverToolsScript)) {
        console.warn(`discover_tools.py not found at ${this.discoverToolsScript}`);
        return null;
      }

      // Run the discovery script with 'project-tools' command
      const result = execSync(`python3 "${this.discoverToolsScript}" project-tools "${projectRoot}"`, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });

      return JSON.parse(result);
    } catch (error) {
      console.error('Project tools discovery failed:', error);
      return null;
    }
  }

  /**
   * Extract all tools from discovery result
   */
  private extractTools(discovery?: DiscoveryResult) {
    if (!discovery) return [];

    // Check if it's a directory result
    if ('files' in discovery) {
      const dirResult = discovery as DirectoryDiscoveryResult;
      const tools = [];
      for (const file of dirResult.files) {
        if (file.success && file.tools) {
          tools.push(...file.tools);
        }
      }
      return tools;
    }

    // Single file result
    const fileResult = discovery as FileDiscoveryResult;
    return fileResult.success ? fileResult.tools : [];
  }
}