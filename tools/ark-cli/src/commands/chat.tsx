import {Command} from 'commander';
import {render} from 'ink';
import * as React from 'react';
import ChatUI from '../components/ChatUI.js';
import {ArkApiProxy} from '../lib/arkApiProxy.js';
import {loadConfig} from '../lib/config.js';
import output from '../lib/output.js';

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

      // Load config
      const config = loadConfig();

      // Initialize proxy first - no spinner, just let ChatUI handle loading state
      try {
        const proxy = new ArkApiProxy();
        const arkApiClient = await proxy.start();

        // Pass the initialized client and config to ChatUI
        render(
          <ChatUI
            initialTargetId={initialTargetId}
            arkApiClient={arkApiClient}
            arkApiProxy={proxy}
            config={config}
          />
        );
      } catch (error) {
        output.error(
          error instanceof Error ? error.message : 'ARK API connection failed'
        );
        process.exit(1);
      }
    });

  return chatCommand;
}
