import {describe, it, expect, jest} from '@jest/globals';
import {execSync} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('sample-projects', () => {
  describe('reverse-tool', () => {
    it('should output correct MCP tool format in JSON', () => {
      const projectPath = path.join(__dirname, 'tests/sample-projects/reverse_tool');
      const cliPath = path.join(__dirname, '../../../dist/index.js');
      
      // Run the command and capture output
      const output = execSync(
        `node ${cliPath} dev tool status ${projectPath} --output json`,
        {encoding: 'utf8'}
      );
      
      // Parse the JSON output
      const result = JSON.parse(output);
      
      // Assert the structure
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('projectRoot');
      expect(result.projectRoot).toContain('reverse_tool');
      expect(result).toHaveProperty('platform', 'python3');
      expect(result).toHaveProperty('projectType', 'pyproject');
      expect(result).toHaveProperty('projectName', 'dev-tests');
      expect(result).toHaveProperty('projectVersion', '0.1.0');
      expect(result).toHaveProperty('hasFastmcp', true);
      expect(result).toHaveProperty('fastmcpVersion', '0.5.0');
      expect(result).toHaveProperty('tools');
      
      // Assert tools array contains MCP-formatted tool
      expect(result.tools).toHaveLength(1);
      const tool = result.tools[0];
      
      // Check MCP tool structure
      expect(tool).toHaveProperty('name', 'reverse_message');
      expect(tool).toHaveProperty('title', 'Reverse Message');
      expect(tool).toHaveProperty('description', 'Reverses the text of a message');
      expect(tool).toHaveProperty('inputSchema');
      
      // Check inputSchema structure
      expect(tool.inputSchema).toEqual({
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Parameter message'
          }
        },
        required: ['message']
      });
    });
  });
});