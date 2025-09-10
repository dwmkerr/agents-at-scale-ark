import chalk from 'chalk';
import { Command } from 'commander';

import { getClusterInfo } from '../../lib/cluster.js';

export function createGetCommand(): Command {
  const get = new Command('get');
  get
    .description('Get current Kubernetes cluster information')
    .option('-c, --context <context>', 'Kubernetes context to use')
    .option('-o, --output <format>', 'Output format (text|json)', 'text')
    .action(async (options) => {
      try {
        const clusterInfo = await getClusterInfo(options.context);

        if (clusterInfo.error) {
          console.error(
            chalk.red('Error getting cluster info:'),
            clusterInfo.error
          );
          process.exit(1);
        }

        if (options.output === 'json') {
          console.log(JSON.stringify({
            context: clusterInfo.context,
            namespace: clusterInfo.namespace,
            type: clusterInfo.type,
            ip: clusterInfo.ip
          }, null, 2));
        } else {
          // Text format (default)
          console.log(`Context: ${clusterInfo.context}`);
          console.log(`Namespace: ${clusterInfo.namespace}`);
          console.log(`Type: ${clusterInfo.type}`);
          console.log(`IP: ${clusterInfo.ip || 'unknown'}`);
        }
      } catch (error: any) {
        console.error(chalk.red('Failed to get cluster info:'), error.message);
        process.exit(1);
      }
    });

  return get;
}