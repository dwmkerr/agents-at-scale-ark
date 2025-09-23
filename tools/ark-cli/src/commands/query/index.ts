import {Command} from 'commander';
import {execa} from 'execa';
import ora from 'ora';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';

async function runQuery(target: string, message: string): Promise<void> {
  const spinner = ora('Creating query...').start();

  // Generate a unique query name
  const timestamp = Date.now();
  const queryName = `cli-query-${timestamp}`;

  // Parse the target format (e.g., model/default -> type: model, name: default)
  const [targetType, targetName] = target.split('/');

  // Create the Query resource
  const queryManifest = {
    apiVersion: 'ark.mckinsey.com/v1alpha1',
    kind: 'Query',
    metadata: {
      name: queryName,
    },
    spec: {
      input: message,
      targets: [
        {
          type: targetType,
          name: targetName,
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
    spinner.text = 'Query status: initializing';

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
        const phase = query.status?.phase;

        // Update spinner with current phase
        if (phase) {
          spinner.text = `Query status: ${phase}`;
        }

        // Check if query is complete based on phase
        if (phase === 'done') {
          queryComplete = true;
          spinner.succeed('Query completed');

          // Extract and display the response from responses array
          if (query.status?.responses && query.status.responses.length > 0) {
            const response = query.status.responses[0];
            console.log('\n' + (response.content || response));
          } else {
            output.warning('No response received');
          }
        } else if (phase === 'error') {
          queryComplete = true;
          spinner.fail('Query failed');

          // Try to get error message from conditions or status
          const errorCondition = query.status?.conditions?.find((c: unknown) => {
            const condition = c as {type?: string; status?: string; message?: string};
            return condition.type === 'Complete' && condition.status === 'False';
          });
          if (errorCondition?.message) {
            output.error(errorCondition.message);
          } else if (query.status?.error) {
            output.error(query.status.error);
          } else {
            output.error('Query failed with unknown error');
          }
        } else if (phase === 'canceled') {
          queryComplete = true;
          spinner.warn('Query canceled');

          // Try to get cancellation reason if available
          if (query.status?.message) {
            output.warning(query.status.message);
          }
        }
      } catch {
        // Query might not exist yet, continue waiting
        spinner.text = 'Running query: waiting for query to be created';
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
        output.error('Invalid target format. Use: model/name or agent/name etc');
        process.exit(1);
      }

      await runQuery(target, message);
    });

  return queryCommand;
}
