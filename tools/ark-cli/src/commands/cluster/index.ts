import { Command } from 'commander';

import { createGetCommand } from './get.js';

export function createClusterCommand(): Command {
  const cluster = new Command('cluster');
  cluster.description('Cluster management commands');

  cluster.addCommand(createGetCommand());

  return cluster;
}
