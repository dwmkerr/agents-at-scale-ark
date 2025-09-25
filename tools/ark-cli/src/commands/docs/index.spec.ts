import {jest, describe, it, expect, beforeEach, afterEach} from '@jest/globals';
import type {ArkConfig} from '../../lib/config.js';

const mockOpen = jest.fn() as any;
jest.unstable_mockModule('open', () => ({
  default: mockOpen,
}));

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockSetTimeout = jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
  fn();
  return {} as NodeJS.Timeout;
});

// Import after mocks are set up
const {createDocsCommand, openDocs} = await import('./index.js');

describe('docs command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpen.mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createDocsCommand', () => {
    it('creates docs command with correct description', () => {
      const mockConfig: ArkConfig = {} as ArkConfig;

      const command = createDocsCommand(mockConfig);

      expect(command.name()).toBe('docs');
      expect(command.description()).toBe('Open the ARK documentation in your browser');
    });
  });

  describe('openDocs', () => {
    it('opens documentation URL in browser', async () => {
      await openDocs();

      // Check console output
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Opening ARK documentation:')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('https://mckinsey.github.io/agents-at-scale-ark/')
      );

      // Check browser was opened with correct URL
      expect(mockOpen).toHaveBeenCalledWith('https://mckinsey.github.io/agents-at-scale-ark/');

      // Check timeout was called
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 500);
    });
  });
});