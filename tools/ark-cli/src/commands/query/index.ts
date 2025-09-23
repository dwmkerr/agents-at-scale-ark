import {Command} from 'commander';
import {execa} from 'execa';
import ora from 'ora';
import chalk from 'chalk';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';

async function runQuery(target: string, message: string): Promise<void> {
  const spinner = ora('Creating query...').start();

  // Generate a unique query name
  const timestamp = Date.now();
  const queryName = `cli-query-${timestamp}`;

  // Create the Query resource
  const queryManifest = {
    apiVersion: 'ark.mckinsey.com/v1alpha1',
    kind: 'Query',
    metadata: {
      name: queryName,
    },
    spec: {
      target: target,
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
    },
  };

  try {
    // Apply the query
    spinner.text = 'Submitting query...';
    await execa('kubectl', ['apply', '-f', '-'], {
      input: JSON.stringify(queryManifest),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Watch for query completion
    spinner.text = 'Processing query...';

    let queryComplete = false;
    let attempts = 0;
    const maxAttempts = 300; // 5 minutes with 1 second intervals

    while (!queryComplete && attempts < maxAttempts) {
      attempts++;

      try {
        const {stdout} = await execa('kubectl', [
          'get',
          'query',
          queryName,
          '-o',
          'json',
        ], {stdio: 'pipe'});

        const query = JSON.parse(stdout);
        const condition = query.status?.conditions?.find((c: any) => c.type === 'Complete');

        if (condition) {
          if (condition.status === 'True') {
            queryComplete = true;
            spinner.succeed('Query completed');

            // Extract and display the response
            if (query.status?.response) {
              console.log('\n' + query.status.response);
            } else {
              output.warning('No response received');
            }
          } else if (condition.reason === 'Failed') {
            spinner.fail('Query failed');
            if (condition.message) {
              output.error(condition.message);
            }
            queryComplete = true;
          }
        }

        // Update spinner with status
        if (!queryComplete && query.status?.conditions) {
          const processingCondition = query.status.conditions.find((c: any) => c.type === 'Processing');
          if (processingCondition?.status === 'True') {
            spinner.text = `Processing query... (${attempts}s)`;
          }
        }
      } catch (error) {
        // Query might not exist yet, continue waiting
      }

      if (!queryComplete) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      }
    }

    if (!queryComplete) {
      spinner.fail('Query timed out');
      output.error('Query did not complete within 5 minutes');
    }

  } catch (error) {
    spinner.fail('Query failed');
    output.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  } finally {
    // Clean up the query resource
    try {
      await execa('kubectl', ['delete', 'query', queryName], {stdio: 'pipe'});
    } catch {
      // Ignore cleanup errors
    }
  }
}

export function createQueryCommand(_: ArkConfig): Command {
  const queryCommand = new Command('query');

  queryCommand
    .description('Execute a single query against a model or agent')
    .argument('<target>', 'Query target (e.g., model/default, agent/my-agent)')
    .argument('<message>', 'Message to send')
    .action(async (target: string, message: string) => {
      // Validate target format
      if (!target.includes('/')) {
        output.error('Invalid target format. Use: model/name or agent/name');
        process.exit(1);
      }

      await runQuery(target, message);
    });

  return queryCommand;
}