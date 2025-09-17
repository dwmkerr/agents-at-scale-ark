import {describe, it, expect} from '@jest/globals';
import {
  DEFAULT_ADDRESS_ARK_API,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_CONNECTION_TEST_TIMEOUT_MS,
  CONFIG_DIR_NAME,
  CONFIG_FILE_NAME,
  DEFAULT_ARK_DASHBOARD_URL,
  DEFAULT_ARK_A2A_URL,
  DEFAULT_ARK_MEMORY_URL,
  DEFAULT_ARK_OTEL_URL,
} from './consts.js';

describe('Constants', () => {
  it('defines correct default values', () => {
    expect(DEFAULT_ADDRESS_ARK_API).toBe('http://localhost:8000');
    expect(DEFAULT_TIMEOUT_MS).toBe(30000);
    expect(DEFAULT_CONNECTION_TEST_TIMEOUT_MS).toBe(5000);
    expect(CONFIG_DIR_NAME).toBe('ark');
    expect(CONFIG_FILE_NAME).toBe('ark-cli.json');
    expect(DEFAULT_ARK_DASHBOARD_URL).toBe('http://localhost:3000');
    expect(DEFAULT_ARK_A2A_URL).toBe('http://localhost:8080');
    expect(DEFAULT_ARK_MEMORY_URL).toBe('http://localhost:8081');
    expect(DEFAULT_ARK_OTEL_URL).toBe('http://localhost:4318');
  });
});