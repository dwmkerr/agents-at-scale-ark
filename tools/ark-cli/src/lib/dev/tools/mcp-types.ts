/**
 * MCP Tool type utilities for discovered tools
 * Uses the official Model Context Protocol types from @modelcontextprotocol/sdk
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// Re-export the official MCP Tool type
export type { Tool as MCPTool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Convert a discovered Python tool to MCP format
 */
export function toMCPTool(discoveredTool: any): Tool {
  // Extract first line of docstring as description
  const description = discoveredTool.docstring 
    ? discoveredTool.docstring.split('\n')[0].trim()
    : undefined;

  // Build properties from parameters
  const properties: Record<string, any> = {};
  const required: string[] = [];
  
  if (discoveredTool.parameters) {
    for (const param of discoveredTool.parameters) {
      // Map Python types to JSON Schema types
      let jsonType = 'string';
      if (param.type) {
        const pythonType = param.type.toLowerCase();
        if (pythonType === 'int' || pythonType === 'float') {
          jsonType = 'number';
        } else if (pythonType === 'bool') {
          jsonType = 'boolean';
        } else if (pythonType.includes('list') || pythonType.includes('array')) {
          jsonType = 'array';
        } else if (pythonType.includes('dict') || pythonType === 'object') {
          jsonType = 'object';
        }
      }
      
      properties[param.name] = {
        type: jsonType,
        description: `Parameter ${param.name}`
      };
      
      // For now, assume all parameters are required
      // Could be enhanced to detect optional parameters
      required.push(param.name);
    }
  }

  return {
    name: discoveredTool.name,
    title: toTitleCase(discoveredTool.name),
    description,
    inputSchema: {
      type: 'object',
      properties: Object.keys(properties).length > 0 ? properties : undefined,
      required: required.length > 0 ? required : undefined
    }
  };
}

/**
 * Convert snake_case to Title Case
 */
function toTitleCase(snakeCase: string): string {
  return snakeCase
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format tool for OpenAI-compatible function calling
 */
export function toOpenAIFunction(tool: Tool) {
  return {
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  };
}