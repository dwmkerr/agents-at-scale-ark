export interface ToolParameter {
  name: string;
  type?: string;
}

export interface DiscoveredTool {
  name: string;
  parameters: ToolParameter[];
  return_type?: string;
  docstring?: string;
}

export interface FileDiscoveryResult {
  success: boolean;
  file: string;
  tools: DiscoveredTool[];
  uses_fastmcp: boolean;
  mcp_instance?: string;
  server_name?: string;
  error?: string;
}

export interface DirectoryDiscoveryResult {
  directory: string;
  files: FileDiscoveryResult[];
  total_tools: number;
  uses_fastmcp: boolean;
}

export type DiscoveryResult = FileDiscoveryResult | DirectoryDiscoveryResult;

export interface ProjectDiscoveryResult {
  path: string;
  exists: boolean;
  is_directory: boolean;
  platform: 'python3' | null;
  project_type: 'pyproject' | 'requirements' | null;
  project_file: string | null;
  project_name: string | null;
  project_version: string | null;
  has_fastmcp: boolean;
  fastmcp_version: string | null;
}

export interface ProjectInfo {
  path: string;
  platform: 'python3';  // Only Python for now, can add 'nodejs' later
  projectType: 'pyproject' | 'requirements' | 'unknown';
  hasVenv: boolean;
  fastMCP: boolean;
  fastMCPVersion?: string;
}

export interface ArkDevToolStatus extends ProjectInfo {
  discovery?: DiscoveryResult;
  tools: DiscoveredTool[];
}