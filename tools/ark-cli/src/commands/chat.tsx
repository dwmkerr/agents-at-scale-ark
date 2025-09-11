import {Command} from 'commander';
import {render} from 'ink';
import * as React from 'react';
import ora from 'ora';
import ChatUI from '../components/ChatUI.js';
import {ArkApiProxy} from '../lib/arkApiProxy.js';

export function createChatCommand(): Command {
  const chatCommand = new Command('chat');
  chatCommand
    .description('Start an interactive chat session with ARK agents or models')
    .argument(
      '[target]',
      'Target to connect to (e.g., agent/sample-agent, model/default)'
    )
    .option('-a, --agent <name>', 'Connect directly to a specific agent')
    .option('-m, --model <name>', 'Connect directly to a specific model')
    .action(async (targetArg, options) => {
      // Determine initial target from argument or options
      let initialTargetId: string | undefined;

      if (targetArg) {
        // Direct target argument (e.g., "agent/sample-agent")
        initialTargetId = targetArg;
      } else if (options.agent) {
        // Agent option
        initialTargetId = `agent/${options.agent}`;
      } else if (options.model) {
        // Model option
        initialTargetId = `model/${options.model}`;
      }

      // Initialize proxy first with spinner
      const spinner = ora('Setting up ARK API connection').start();
      
      try {
        const proxy = new ArkApiProxy();
        const arkApiClient = await proxy.start();
        
        spinner.stop();
        
        // Pass the initialized client to ChatUI
        render(<ChatUI initialTargetId={initialTargetId} arkApiClient={arkApiClient} arkApiProxy={proxy} />);
      } catch (error) {
        spinner.fail(error instanceof Error ? error.message : 'ARK API connection failed');
        process.exit(1);
      }
    });

  return chatCommand;
}
