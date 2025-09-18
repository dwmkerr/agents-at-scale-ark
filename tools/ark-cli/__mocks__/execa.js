// Manual mock for execa
import {jest} from '@jest/globals';

// Create mock functions with Jest
const execa = jest.fn();
const execaSync = jest.fn();
const execaCommand = jest.fn();
const execaCommandSync = jest.fn();

// Export the mocks
export {
  execa,
  execaSync,
  execaCommand,
  execaCommandSync
};