import {describe, it, expect, jest, beforeEach, afterEach} from '@jest/globals';
import {execSync} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ark dev tool generate', () => {
  let tempDir: string;
  const cliPath = path.join(__dirname, '../../../dist/index.js');

  beforeEach(() => {
    // Create a temp directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Dockerfile generation', () => {
    it('should generate correct Dockerfile for pyproject type', () => {
      // Create a test .ark.yaml
      const arkYaml = `version: "1.0"
project:
  path: ${tempDir}
  platform: python3
  type: pyproject
  name: test-tool
  version: 0.2.0
  framework: fastmcp
  frameworkVersion: 0.5.0
`;
      fs.writeFileSync(path.join(tempDir, '.ark.yaml'), arkYaml);

      // Run the generate command
      execSync(`node ${cliPath} dev tool generate ${tempDir}`, {encoding: 'utf8'});

      // Check Dockerfile was generated
      const dockerfilePath = path.join(tempDir, 'Dockerfile');
      expect(fs.existsSync(dockerfilePath)).toBe(true);

      // Check Dockerfile content
      const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');

      // Should have uv commands for pyproject
      expect(dockerfileContent).toContain('RUN pip install uv');
      expect(dockerfileContent).toContain('COPY pyproject.toml ./');
      expect(dockerfileContent).toContain('COPY uv.lock* ./');
      expect(dockerfileContent).toContain('RUN uv sync --frozen');
      expect(dockerfileContent).toContain('CMD ["uv", "run", "python", "-m", "test-tool"]');

      // Should NOT have requirements.txt commands
      expect(dockerfileContent).not.toContain('requirements.txt');
      expect(dockerfileContent).not.toContain('pip install --no-cache-dir');
    });

    it('should generate correct Dockerfile for requirements type', () => {
      // Create a test .ark.yaml with requirements type
      const arkYaml = `version: "1.0"
project:
  path: ${tempDir}
  platform: python3
  type: requirements
  name: test-req-tool
  version: 0.1.0
`;
      fs.writeFileSync(path.join(tempDir, '.ark.yaml'), arkYaml);

      // Run the generate command
      execSync(`node ${cliPath} dev tool generate ${tempDir}`, {encoding: 'utf8'});

      // Check Dockerfile was generated
      const dockerfilePath = path.join(tempDir, 'Dockerfile');
      expect(fs.existsSync(dockerfilePath)).toBe(true);

      // Check Dockerfile content
      const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');

      // Should have pip commands for requirements.txt
      expect(dockerfileContent).toContain('COPY requirements.txt ./');
      expect(dockerfileContent).toContain('RUN pip install --no-cache-dir -r requirements.txt');
      expect(dockerfileContent).toContain('CMD ["python", "-m", "test-req-tool"]');

      // Should NOT have uv commands
      expect(dockerfileContent).not.toContain('RUN pip install uv');
      expect(dockerfileContent).not.toContain('pyproject.toml');
      expect(dockerfileContent).not.toContain('uv.lock');
      expect(dockerfileContent).not.toContain('uv sync');
    });
  });

  describe('.dockerignore generation', () => {
    it('should generate comprehensive .dockerignore file', () => {
      // Create a test .ark.yaml
      const arkYaml = `version: "1.0"
project:
  platform: python3
  type: pyproject
  name: test-tool
`;
      fs.writeFileSync(path.join(tempDir, '.ark.yaml'), arkYaml);

      // Run the generate command
      execSync(`node ${cliPath} dev tool generate ${tempDir}`, {encoding: 'utf8'});

      // Check .dockerignore was generated
      const dockerignorePath = path.join(tempDir, '.dockerignore');
      expect(fs.existsSync(dockerignorePath)).toBe(true);

      // Check .dockerignore content
      const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf-8');

      // Should include Python patterns
      expect(dockerignoreContent).toContain('__pycache__/');
      expect(dockerignoreContent).toContain('*.py[cod]');
      expect(dockerignoreContent).toContain('*.egg-info/');

      // Should include UV patterns
      expect(dockerignoreContent).toContain('.venv/');

      // Should include testing patterns
      expect(dockerignoreContent).toContain('.pytest_cache/');
      expect(dockerignoreContent).toContain('.coverage');

      // Should include IDE patterns
      expect(dockerignoreContent).toContain('.vscode/');
      expect(dockerignoreContent).toContain('.idea/');

      // Should include ARK specific patterns
      expect(dockerignoreContent).toContain('.ark.yaml');
      expect(dockerignoreContent).toContain('devspace.yaml');
    });
  });

  describe('file skip behavior', () => {
    it('should skip existing files without overwriting', () => {
      // Create a test .ark.yaml
      const arkYaml = `version: "1.0"
project:
  platform: python3
  type: pyproject
  name: test-tool
`;
      fs.writeFileSync(path.join(tempDir, '.ark.yaml'), arkYaml);

      // Create an existing Dockerfile with custom content
      const customDockerfile = '# My custom Dockerfile\nFROM alpine\n';
      fs.writeFileSync(path.join(tempDir, 'Dockerfile'), customDockerfile);

      // Run the generate command
      const output = execSync(`node ${cliPath} dev tool generate ${tempDir}`, {encoding: 'utf8'});

      // Check that existing file was not overwritten
      const dockerfileContent = fs.readFileSync(path.join(tempDir, 'Dockerfile'), 'utf-8');
      expect(dockerfileContent).toBe(customDockerfile);

      // Check that output mentions skipping
      expect(output).toContain('No new files generated');
    });
  });

  describe('error handling', () => {
    it('should fail when .ark.yaml is missing', () => {
      // Try to run generate without .ark.yaml
      expect(() => {
        execSync(`node ${cliPath} dev tool generate ${tempDir}`, {encoding: 'utf8'});
      }).toThrow('.ark.yaml not found');
    });
  });
});