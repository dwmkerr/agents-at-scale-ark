import {describe, it, expect, jest, beforeEach} from '@jest/globals';

// Mock execa using unstable_mockModule
jest.unstable_mockModule('execa', () => ({
  execa: jest.fn()
}));

// Dynamic imports after mock
const {execa} = await import('execa');
const {checkCommandExists} = await import('./commands.js');

// Type the mock properly
const mockExeca = execa as any;

describe('commands', () => {
  describe('checkCommandExists', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns true when command executes successfully', async () => {
      mockExeca.mockResolvedValue({
        stdout: 'v1.0.0',
        stderr: '',
        exitCode: 0,
      });

      const result = await checkCommandExists('helm', ['version']);

      expect(result).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith('helm', ['version']);
    });

    it('returns false when command fails', async () => {
      mockExeca.mockRejectedValue(new Error('Command not found'));

      const result = await checkCommandExists('nonexistent', ['--version']);

      expect(result).toBe(false);
      expect(mockExeca).toHaveBeenCalledWith('nonexistent', ['--version']);
    });

    it('uses default --version arg when no args provided', async () => {
      mockExeca.mockResolvedValue({
        stdout: '1.0.0',
        stderr: '',
        exitCode: 0,
      });

      const result = await checkCommandExists('node');

      expect(result).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith('node', ['--version']);
    });

    it('uses custom args when provided', async () => {
      mockExeca.mockResolvedValue({
        stdout: 'Client Version: v1.28.0',
        stderr: '',
        exitCode: 0,
      });

      const result = await checkCommandExists('kubectl', ['version', '--client']);

      expect(result).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith('kubectl', ['version', '--client']);
    });

    it('handles empty args array', async () => {
      mockExeca.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = await checkCommandExists('echo', []);

      expect(result).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith('echo', []);
    });
  });
});