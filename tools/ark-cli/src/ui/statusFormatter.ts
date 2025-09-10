import chalk from 'chalk';

import { StatusData, ServiceStatus, DependencyStatus } from '../lib/types.js';

export class StatusFormatter {
  /**
   * Print status check results to console
   */
  public static printStatus(statusData: StatusData): void {
    // Print services status
    console.log(chalk.cyan.bold('\nARK Services:'));
    for (const service of statusData.services) {
      StatusFormatter.printService(service);
    }

    // Print dependencies status
    console.log(chalk.cyan.bold('\nSystem Dependencies:'));
    for (const dep of statusData.dependencies) {
      StatusFormatter.printDependency(dep);
    }

    console.log();
  }

  private static printService(service: ServiceStatus): void {
    const statusColor =
      service.status === 'healthy'
        ? chalk.green('✓ healthy')
        : service.status === 'unhealthy'
          ? chalk.red('✗ unhealthy')
          : chalk.yellow('? not installed');

    const urlText = service.url ? chalk.gray(` ${service.url}`) : '';
    console.log(`  ${statusColor} ${chalk.bold(service.name)}${urlText}`);
    
    if (service.status !== 'healthy' && service.details) {
      // Show simplified details on next line for unhealthy services
      const simplifiedDetails = service.details
        .replace(`${service.name} is `, '')
        .replace('or not accessible', 'or accessible');
      console.log(`    ${chalk.gray(simplifiedDetails)}`);
    }
  }

  private static printDependency(dep: DependencyStatus): void {
    const statusColor = dep.installed
      ? chalk.green('✓ installed')
      : chalk.red('✗ missing');

    const versionText = dep.version ? chalk.gray(` ${dep.version}`) : '';
    console.log(`  ${statusColor} ${chalk.bold(dep.name)}${versionText}`);
    
    if (dep.details && !dep.installed) {
      // Only show details if there's an issue
      console.log(`    ${chalk.gray(dep.details)}`);
    }
  }
}
