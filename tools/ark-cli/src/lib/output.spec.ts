import {describe, it, expect, beforeEach, afterEach, jest} from '@jest/globals';
import chalk from 'chalk';
import output from './output.js';

describe('output', () => {
  let consoleErrorSpy: any;
  let consoleLogSpy: any;

  beforeEach(() => {
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined as any);
    consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('error', () => {
    it('should output error message with red cross and prefix', () => {
      output.error('Something went wrong');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        chalk.red('✗ error:'),
        'Something went wrong'
      );
    });

    it('should handle additional arguments', () => {
      const error = new Error('Test error');
      output.error('Failed to connect', error, 123);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        chalk.red('✗ error:'),
        'Failed to connect',
        error,
        123
      );
    });
  });

  describe('success', () => {
    it('should output success message with green checkmark', () => {
      output.success('Operation completed');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.green('✓'),
        'Operation completed'
      );
    });

    it('should handle additional arguments', () => {
      output.success('Deployed', 'v1.0.0', {status: 'ok'});

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.green('✓'),
        'Deployed',
        'v1.0.0',
        {status: 'ok'}
      );
    });
  });

  describe('info', () => {
    it('should output info message in gray', () => {
      output.info('Processing request...');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.gray('Processing request...')
      );
    });

    it('should handle additional arguments', () => {
      output.info('Status:', 'running', 42);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.gray('Status:'),
        'running',
        42
      );
    });
  });

  describe('warning', () => {
    it('should output warning message with yellow exclamation and prefix', () => {
      output.warning('Resource limit approaching');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.yellow.bold('!'),
        chalk.yellow('warning:'),
        'Resource limit approaching'
      );
    });

    it('should handle additional arguments', () => {
      const details = {cpu: '85%', memory: '92%'};
      output.warning('High resource usage', details);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        chalk.yellow.bold('!'),
        chalk.yellow('warning:'),
        'High resource usage',
        details
      );
    });
  });
});
