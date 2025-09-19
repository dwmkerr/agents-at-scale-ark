import {describe, it, expect, jest, beforeEach, afterEach} from '@jest/globals';

// Mock chalk to avoid ANSI codes in tests
jest.unstable_mockModule('chalk', () => ({
  default: {
    red: (str: string) => str,
    yellow: (str: string) => str,
    gray: (str: string) => str,
    blue: (str: string) => str,
  }
}));

// Mock commands module
jest.unstable_mockModule('./commands.js', () => ({
  checkCommandExists: jest.fn()
}));

// Mock config module
jest.unstable_mockModule('./config.js', () => ({
  loadConfig: jest.fn()
}));

// Dynamic imports after mocks
const {checkCommandExists} = await import('./commands.js');
const {loadConfig} = await import('./config.js');
const {startup} = await import('./startup.js');

// Type the mocks
const mockCheckCommandExists = checkCommandExists as any;
const mockLoadConfig = loadConfig as any;

// Mock fetch globally
global.fetch = jest.fn() as any;

describe('startup', () => {
  let mockExit: jest.SpiedFunction<typeof process.exit>;
  let mockConsoleError: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as any).mockClear();
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('returns config when all required commands are installed', async () => {
    const expectedConfig = {
      chat: {
        streaming: true,
        outputFormat: 'text'
      }
    };

    // Mock all commands as available
    mockCheckCommandExists.mockResolvedValue(true);
    mockLoadConfig.mockReturnValue(expectedConfig);

    const config = await startup();

    expect(config).toEqual(expectedConfig);
    expect(mockCheckCommandExists).toHaveBeenCalledWith('kubectl', ['version', '--client']);
    expect(mockCheckCommandExists).toHaveBeenCalledWith('helm', ['version', '--short']);
    expect(mockLoadConfig).toHaveBeenCalledTimes(1);
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('exits with error when kubectl is missing', async () => {
    // Mock kubectl as missing, helm as available
    mockCheckCommandExists
      .mockResolvedValueOnce(false) // kubectl
      .mockResolvedValueOnce(true); // helm

    await expect(startup()).rejects.toThrow('process.exit');

    expect(mockConsoleError).toHaveBeenCalledWith('error: kubectl is required');
    expect(mockConsoleError).toHaveBeenCalledWith('  https://kubernetes.io/docs/tasks/tools/');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('exits with error when helm is missing', async () => {
    // Mock kubectl as available, helm as missing
    mockCheckCommandExists
      .mockResolvedValueOnce(true) // kubectl
      .mockResolvedValueOnce(false); // helm

    await expect(startup()).rejects.toThrow('process.exit');

    expect(mockConsoleError).toHaveBeenCalledWith('error: helm is required');
    expect(mockConsoleError).toHaveBeenCalledWith('  https://helm.sh/docs/intro/install/');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('exits with error when both commands are missing', async () => {
    // Mock both commands as missing
    mockCheckCommandExists.mockResolvedValue(false);

    await expect(startup()).rejects.toThrow('process.exit');

    expect(mockConsoleError).toHaveBeenCalledWith('error: kubectl is required');
    expect(mockConsoleError).toHaveBeenCalledWith('  https://kubernetes.io/docs/tasks/tools/');
    expect(mockConsoleError).toHaveBeenCalledWith('error: helm is required');
    expect(mockConsoleError).toHaveBeenCalledWith('  https://helm.sh/docs/intro/install/');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('checks commands with correct arguments', async () => {
    mockCheckCommandExists.mockResolvedValue(true);
    mockLoadConfig.mockReturnValue({ chat: {} });

    await startup();

    expect(mockCheckCommandExists).toHaveBeenCalledTimes(2);
    expect(mockCheckCommandExists).toHaveBeenNthCalledWith(1, 'kubectl', ['version', '--client']);
    expect(mockCheckCommandExists).toHaveBeenNthCalledWith(2, 'helm', ['version', '--short']);
  });

  it('loads config after checking requirements', async () => {
    mockCheckCommandExists.mockResolvedValue(true);
    const expectedConfig = { chat: { streaming: false } };
    mockLoadConfig.mockReturnValue(expectedConfig);

    const config = await startup();

    // Verify order - checkCommandExists should be called before loadConfig
    const checkCallOrder = mockCheckCommandExists.mock.invocationCallOrder[0];
    const loadCallOrder = mockLoadConfig.mock.invocationCallOrder[0];
    expect(checkCallOrder).toBeLessThan(loadCallOrder);
    expect(config).toEqual(expectedConfig);
  });

  describe('version fetching', () => {
    beforeEach(() => {
      // Setup successful requirements check and config
      mockCheckCommandExists.mockResolvedValue(true);
      mockLoadConfig.mockReturnValue({ chat: { streaming: true } });
    });

    it('fetches latest version from GitHub API', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ tag_name: 'v0.1.35' })
      });

      const config = await startup();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/mckinsey/agents-at-scale-ark/releases/latest'
      );

      // Wait for async fetch to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(config.latestVersion).toBe('v0.1.35');
    });

    it('handles GitHub API failure gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const config = await startup();

      // Wait for async fetch attempt
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should not have latestVersion set
      expect(config.latestVersion).toBeUndefined();
    });

    it('handles non-OK response from GitHub API', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 403
      });

      const config = await startup();

      // Wait for async fetch to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should not have latestVersion set
      expect(config.latestVersion).toBeUndefined();
    });

    it('continues startup even if version fetch fails', async () => {
      (global.fetch as any).mockRejectedValue(new Error('API Error'));

      const config = await startup();

      // Startup should complete successfully
      expect(config).toBeDefined();
      expect(config.chat).toBeDefined();
      expect(mockExit).not.toHaveBeenCalled();
    });
  });
});