import {jest} from '@jest/globals';
import {Command} from 'commander';

const mockArkApiClient = {
  getQueryTargets: jest.fn() as any,
};

const mockStart = jest.fn() as any;
mockStart.mockResolvedValue(mockArkApiClient);

const mockArkApiProxy = jest.fn() as any;
mockArkApiProxy.prototype = {
  start: mockStart,
  stop: jest.fn(),
};

jest.unstable_mockModule('../../lib/arkApiProxy.js', () => ({
  ArkApiProxy: mockArkApiProxy,
}));

const mockOutput = {
  warning: jest.fn(),
  error: jest.fn(),
};
jest.unstable_mockModule('../../lib/output.js', () => ({
  default: mockOutput,
}));

const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

const {createTargetsCommand} = await import('./index.js');

describe('targets command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates command with correct structure', () => {
    const command = createTargetsCommand({});

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('targets');
  });

  it('lists targets in text format', async () => {
    const mockTargets = [
      {id: 'agent/gpt-assistant', type: 'agent', name: 'gpt-assistant'},
      {id: 'model/gpt-4', type: 'model', name: 'gpt-4'},
    ];
    mockArkApiClient.getQueryTargets.mockResolvedValue(mockTargets);

    const command = createTargetsCommand({});
    await command.parseAsync(['node', 'test']);

    expect(mockArkApiProxy.prototype.start).toHaveBeenCalled();
    expect(mockArkApiClient.getQueryTargets).toHaveBeenCalled();
    expect(mockConsoleLog).toHaveBeenCalledWith('agent/gpt-assistant');
    expect(mockConsoleLog).toHaveBeenCalledWith('model/gpt-4');
    expect(mockArkApiProxy.prototype.stop).toHaveBeenCalled();
  });

  it('lists targets in json format', async () => {
    const mockTargets = [{id: 'agent/gpt', type: 'agent', name: 'gpt'}];
    mockArkApiClient.getQueryTargets.mockResolvedValue(mockTargets);

    const command = createTargetsCommand({});
    await command.parseAsync(['node', 'test', '-o', 'json']);

    expect(mockConsoleLog).toHaveBeenCalledWith(
      JSON.stringify(mockTargets, null, 2)
    );
  });

  it('filters targets by type', async () => {
    const mockTargets = [
      {id: 'agent/gpt', type: 'agent', name: 'gpt'},
      {id: 'model/claude', type: 'model', name: 'claude'},
      {id: 'agent/helper', type: 'agent', name: 'helper'},
    ];
    mockArkApiClient.getQueryTargets.mockResolvedValue(mockTargets);

    const command = createTargetsCommand({});
    await command.parseAsync(['node', 'test', '-t', 'agent']);

    expect(mockConsoleLog).toHaveBeenCalledWith('agent/gpt');
    expect(mockConsoleLog).toHaveBeenCalledWith('agent/helper');
    expect(mockConsoleLog).not.toHaveBeenCalledWith('model/claude');
  });

  it('sorts targets by type then name', async () => {
    const mockTargets = [
      {id: 'model/b', type: 'model', name: 'b'},
      {id: 'agent/z', type: 'agent', name: 'z'},
      {id: 'agent/a', type: 'agent', name: 'a'},
      {id: 'model/a', type: 'model', name: 'a'},
    ];
    mockArkApiClient.getQueryTargets.mockResolvedValue(mockTargets);

    const command = createTargetsCommand({});
    await command.parseAsync(['node', 'test']);

    // Check order of calls
    const calls = mockConsoleLog.mock.calls.map((call) => call[0]);
    expect(calls).toEqual(['agent/a', 'agent/z', 'model/a', 'model/b']);
  });

  it('shows warning when no targets', async () => {
    mockArkApiClient.getQueryTargets.mockResolvedValue([]);

    const command = createTargetsCommand({});
    await command.parseAsync(['node', 'test']);

    expect(mockOutput.warning).toHaveBeenCalledWith('no targets available');
  });

  it('handles errors and stops proxy', async () => {
    mockArkApiClient.getQueryTargets.mockRejectedValue(new Error('API failed'));

    const command = createTargetsCommand({});

    await expect(command.parseAsync(['node', 'test'])).rejects.toThrow(
      'process.exit called'
    );
    expect(mockOutput.error).toHaveBeenCalledWith(
      'fetching targets:',
      'API failed'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockArkApiProxy.prototype.stop).toHaveBeenCalled();
  });

  it('list subcommand works', async () => {
    mockArkApiClient.getQueryTargets.mockResolvedValue([]);

    const command = createTargetsCommand({});
    await command.parseAsync(['node', 'test', 'list']);

    expect(mockArkApiClient.getQueryTargets).toHaveBeenCalled();
  });
});
