import {jest, describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import type {ArkConfig} from '../../lib/config.js';

const mockOpen = jest.fn() as any;
jest.unstable_mockModule('open', () => ({
  default: mockOpen,
}));

const mockSpinner = {
  start: jest.fn(),
  succeed: jest.fn(),
  fail: jest.fn(),
} as any;

const mockOra = jest.fn(() => mockSpinner) as any;
jest.unstable_mockModule('ora', () => ({
  default: mockOra,
}));

const mockProxy = {
  start: jest.fn(() => Promise.resolve('http://localhost:3274')),
  stop: jest.fn(),
} as any;

const mockArkServiceProxy = jest.fn() as any;
jest.unstable_mockModule('../../lib/arkServiceProxy.js', () => ({
  ArkServiceProxy: mockArkServiceProxy,
}));

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit');
});
const mockSetTimeout = jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
  fn();
  return {} as NodeJS.Timeout;
});

// Mock process.stdin.resume
jest.spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin);

// Import after mocks are set up
const {createDashboardCommand, openDashboard} = await import('./index.js');

describe('dashboard command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpinner.start.mockReturnValue(mockSpinner);
    mockArkServiceProxy.mockReturnValue(mockProxy);
    mockOpen.mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createDashboardCommand', () => {
    it('creates dashboard command with correct description', () => {
      const mockConfig: ArkConfig = {} as ArkConfig;

      const command = createDashboardCommand(mockConfig);

      expect(command.name()).toBe('dashboard');
      expect(command.description()).toBe('Open the ARK dashboard in your browser');
    });
  });

  describe('openDashboard', () => {
    it('starts proxy and opens browser', async () => {
      await openDashboard();

      // Check spinner was started
      expect(mockSpinner.start).toHaveBeenCalled();
      expect(mockSpinner.succeed).toHaveBeenCalledWith('Dashboard connected');

      // Check proxy was created and started
      expect(mockArkServiceProxy).toHaveBeenCalledWith(
        expect.objectContaining({name: 'ark-dashboard'}),
        3274
      );
      expect(mockProxy.start).toHaveBeenCalled();

      // Check browser was opened
      expect(mockOpen).toHaveBeenCalledWith('http://localhost:3274');

      // Check console output
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('ARK dashboard running on:')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Press Ctrl+C to stop')
      );
    });

    it('handles errors gracefully', async () => {
      // Make proxy.start fail
      mockProxy.start.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(openDashboard()).rejects.toThrow('process.exit');

      // Check spinner showed error
      expect(mockSpinner.fail).toHaveBeenCalledWith('Connection failed');

      // Check process exited with error code
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });
});