import {describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import {loadConfig} from './config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Config', () => {
  const originalEnv = process.env;
  const testProjectConfig = path.join(process.cwd(), '.arkrc.yaml');
  const testUserConfig = path.join(os.homedir(), '.arkrc.yaml');

  beforeEach(() => {
    // Reset environment
    process.env = {...originalEnv};
    // Clean up any existing test configs
    if (fs.existsSync(testProjectConfig)) {
      fs.unlinkSync(testProjectConfig);
    }
    if (fs.existsSync(testUserConfig)) {
      fs.unlinkSync(testUserConfig);
    }
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    // Clean up test configs
    if (fs.existsSync(testProjectConfig)) {
      fs.unlinkSync(testProjectConfig);
    }
    if (fs.existsSync(testUserConfig)) {
      fs.unlinkSync(testUserConfig);
    }
  });

  it('should load default config when no files or env vars exist', () => {
    const config = loadConfig();
    expect(config.chat?.streaming).toBe(true);
    expect(config.chat?.outputFormat).toBe('text');
  });

  it('should override defaults with environment variables', () => {
    process.env.ARK_CHAT_STREAMING = '0';
    process.env.ARK_CHAT_OUTPUT_FORMAT = 'markdown';

    const config = loadConfig();
    expect(config.chat?.streaming).toBe(false);
    expect(config.chat?.outputFormat).toBe('markdown');
  });

  it('should accept "1" and "true" for streaming', () => {
    process.env.ARK_CHAT_STREAMING = '1';
    let config = loadConfig();
    expect(config.chat?.streaming).toBe(true);

    process.env.ARK_CHAT_STREAMING = 'true';
    config = loadConfig();
    expect(config.chat?.streaming).toBe(true);
  });

  it('should load project config file', () => {
    const configContent = `
chat:
  streaming: false
  outputFormat: markdown
`;
    fs.writeFileSync(testProjectConfig, configContent);

    const config = loadConfig();
    expect(config.chat?.streaming).toBe(false);
    expect(config.chat?.outputFormat).toBe('markdown');
  });

  it('should prioritize env vars over config files', () => {
    const configContent = `
chat:
  streaming: false
  outputFormat: markdown
`;
    fs.writeFileSync(testProjectConfig, configContent);

    process.env.ARK_CHAT_STREAMING = '1';
    process.env.ARK_CHAT_OUTPUT_FORMAT = 'text';

    const config = loadConfig();
    expect(config.chat?.streaming).toBe(true);
    expect(config.chat?.outputFormat).toBe('text');
  });

  it('should handle invalid config files gracefully', () => {
    fs.writeFileSync(testProjectConfig, 'invalid: yaml: content: {{{');

    // Should fall back to defaults without throwing
    const config = loadConfig();
    expect(config.chat?.streaming).toBe(true);
    expect(config.chat?.outputFormat).toBe('text');
  });

  it('should handle partial configs', () => {
    const configContent = `
chat:
  streaming: false
`;
    fs.writeFileSync(testProjectConfig, configContent);

    const config = loadConfig();
    expect(config.chat?.streaming).toBe(false);
    expect(config.chat?.outputFormat).toBe('text'); // Should use default
  });
});
