import { describe, it, expect } from '@jest/globals';
import { isCommandAvailable } from './commandUtils.js';

describe('commandUtils', () => {
  describe('isCommandAvailable', () => {
    it('should return true for node command', async () => {
      // Node should always be available since we're running in Node
      const result = await isCommandAvailable('node');
      expect(result).toBe(true);
    });

    it('should return false for non-existent command', async () => {
      // Very unlikely command name
      const result = await isCommandAvailable('this-command-definitely-does-not-exist-xyz123');
      expect(result).toBe(false);
    });
  });
});