import {jest} from '@jest/globals';
import path from 'path';
import os from 'os';

const mockFs = {
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
};

jest.unstable_mockModule('fs', () => ({
  default: mockFs,
  ...mockFs
}));

const mockYaml = {
  parse: jest.fn(),
  stringify: jest.fn(),
};

jest.unstable_mockModule('yaml', () => ({
  default: mockYaml,
  ...mockYaml
}));

const {loadConfig, getConfigPaths, formatConfig} = await import('./config.js');

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {...originalEnv};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('returns default config when no files exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const config = loadConfig();

      expect(config).toEqual({
        chat: {
          streaming: true,
          outputFormat: 'text',
        },
      });
    });

    it('loads user config from home directory', () => {
      const userConfigPath = path.join(os.homedir(), '.arkrc.yaml');
      mockFs.existsSync.mockImplementation((path) => path === userConfigPath);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.parse.mockReturnValue({
        chat: {
          streaming: false,
          outputFormat: 'markdown',
        },
      });

      const config = loadConfig();

      expect(mockFs.readFileSync).toHaveBeenCalledWith(userConfigPath, 'utf-8');
      expect(config.chat?.streaming).toBe(false);
      expect(config.chat?.outputFormat).toBe('markdown');
    });

    it('loads project config from current directory', () => {
      const projectConfigPath = path.join(process.cwd(), '.arkrc.yaml');
      mockFs.existsSync.mockImplementation((path) => path === projectConfigPath);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.parse.mockReturnValue({
        chat: {
          streaming: false,
        },
      });

      const config = loadConfig();

      expect(mockFs.readFileSync).toHaveBeenCalledWith(projectConfigPath, 'utf-8');
      expect(config.chat?.streaming).toBe(false);
    });

    it('project config overrides user config', () => {
      const userConfigPath = path.join(os.homedir(), '.arkrc.yaml');
      const projectConfigPath = path.join(process.cwd(), '.arkrc.yaml');

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync
        .mockReturnValueOnce('user yaml')
        .mockReturnValueOnce('project yaml');

      mockYaml.parse
        .mockReturnValueOnce({
          chat: {
            streaming: false,
            outputFormat: 'markdown',
          },
        })
        .mockReturnValueOnce({
          chat: {
            streaming: true,
          },
        });

      const config = loadConfig();

      expect(config.chat?.streaming).toBe(true);
      expect(config.chat?.outputFormat).toBe('markdown');
    });

    it('environment variables override all configs', () => {
      mockFs.existsSync.mockReturnValue(false);
      process.env.ARK_CHAT_STREAMING = 'false';
      process.env.ARK_CHAT_OUTPUT_FORMAT = 'markdown';

      const config = loadConfig();

      expect(config.chat?.streaming).toBe(false);
      expect(config.chat?.outputFormat).toBe('markdown');
    });

    it('handles ARK_CHAT_STREAMING=1', () => {
      mockFs.existsSync.mockReturnValue(false);
      process.env.ARK_CHAT_STREAMING = '1';

      const config = loadConfig();

      expect(config.chat?.streaming).toBe(true);
    });

    it('handles ARK_CHAT_STREAMING=true', () => {
      mockFs.existsSync.mockReturnValue(false);
      process.env.ARK_CHAT_STREAMING = 'true';

      const config = loadConfig();

      expect(config.chat?.streaming).toBe(true);
    });

    it('handles ARK_CHAT_STREAMING=0', () => {
      mockFs.existsSync.mockReturnValue(false);
      process.env.ARK_CHAT_STREAMING = '0';

      const config = loadConfig();

      expect(config.chat?.streaming).toBe(false);
    });

    it('ignores invalid ARK_CHAT_OUTPUT_FORMAT', () => {
      mockFs.existsSync.mockReturnValue(false);
      process.env.ARK_CHAT_OUTPUT_FORMAT = 'invalid';

      const config = loadConfig();

      expect(config.chat?.outputFormat).toBe('text');
    });

    it('handles uppercase ARK_CHAT_OUTPUT_FORMAT', () => {
      mockFs.existsSync.mockReturnValue(false);
      process.env.ARK_CHAT_OUTPUT_FORMAT = 'MARKDOWN';

      const config = loadConfig();

      expect(config.chat?.outputFormat).toBe('markdown');
    });

    it('throws error for invalid YAML in user config', () => {
      const userConfigPath = path.join(os.homedir(), '.arkrc.yaml');
      mockFs.existsSync.mockImplementation((path) => path === userConfigPath);
      mockFs.readFileSync.mockReturnValue('invalid yaml');
      mockYaml.parse.mockImplementation(() => {
        throw new Error('YAML parse error');
      });

      expect(() => loadConfig()).toThrow(
        `Invalid YAML in ${userConfigPath}: YAML parse error`
      );
    });

    it('throws error for invalid YAML in project config', () => {
      const projectConfigPath = path.join(process.cwd(), '.arkrc.yaml');
      mockFs.existsSync.mockImplementation((path) => path === projectConfigPath);
      mockFs.readFileSync.mockReturnValue('invalid yaml');
      mockYaml.parse.mockImplementation(() => {
        throw new Error('Unexpected token');
      });

      expect(() => loadConfig()).toThrow(
        `Invalid YAML in ${projectConfigPath}: Unexpected token`
      );
    });

    it('handles non-Error exceptions in YAML parsing', () => {
      const userConfigPath = path.join(os.homedir(), '.arkrc.yaml');
      mockFs.existsSync.mockImplementation((path) => path === userConfigPath);
      mockFs.readFileSync.mockReturnValue('invalid yaml');
      mockYaml.parse.mockImplementation(() => {
        throw 'string error';
      });

      expect(() => loadConfig()).toThrow(
        `Invalid YAML in ${userConfigPath}: Unknown error`
      );
    });

    it('merges partial configs correctly', () => {
      const userConfigPath = path.join(os.homedir(), '.arkrc.yaml');
      mockFs.existsSync.mockImplementation((path) => path === userConfigPath);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.parse.mockReturnValue({
        chat: {
          streaming: false,
        },
      });

      const config = loadConfig();

      expect(config.chat?.streaming).toBe(false);
      expect(config.chat?.outputFormat).toBe('text');
    });

    it('handles empty config files', () => {
      const userConfigPath = path.join(os.homedir(), '.arkrc.yaml');
      mockFs.existsSync.mockImplementation((path) => path === userConfigPath);
      mockFs.readFileSync.mockReturnValue('');
      mockYaml.parse.mockReturnValue({});

      const config = loadConfig();

      expect(config).toEqual({
        chat: {
          streaming: true,
          outputFormat: 'text',
        },
      });
    });

    it('handles config with no chat section', () => {
      const userConfigPath = path.join(os.homedir(), '.arkrc.yaml');
      mockFs.existsSync.mockImplementation((path) => path === userConfigPath);
      mockFs.readFileSync.mockReturnValue('yaml content');
      mockYaml.parse.mockReturnValue({
        someOtherKey: 'value',
      });

      const config = loadConfig();

      expect(config.chat?.streaming).toBe(true);
      expect(config.chat?.outputFormat).toBe('text');
    });
  });

  describe('getConfigPaths', () => {
    it('returns correct paths', () => {
      const paths = getConfigPaths();

      expect(paths.user).toBe(path.join(os.homedir(), '.arkrc.yaml'));
      expect(paths.project).toBe(path.join(process.cwd(), '.arkrc.yaml'));
    });
  });

  describe('formatConfig', () => {
    it('formats config as YAML', () => {
      const config = {
        chat: {
          streaming: true,
          outputFormat: 'markdown' as const,
        },
      };
      mockYaml.stringify.mockReturnValue('formatted yaml');

      const result = formatConfig(config);

      expect(mockYaml.stringify).toHaveBeenCalledWith(config);
      expect(result).toBe('formatted yaml');
    });
  });
});