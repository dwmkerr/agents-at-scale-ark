import chalk from 'chalk';
import {StatusData, ServiceStatus, DependencyStatus} from '../lib/types.js';

export class StatusFormatter {
  /**
   * Print status check results to console
   */
  public static printStatus(
    statusData: StatusData & {clusterAccess?: boolean; clusterInfo?: any}
  ): void {
    // Print ARK status header
    console.log();
    if (!statusData.clusterAccess) {
      console.log(chalk.red.bold('ARK STATUS: ') + chalk.red('No cluster access'));
    } else if (!statusData.arkReady) {
      console.log(chalk.yellow.bold('ARK STATUS: ') + chalk.yellow('Not ready (controller not running)'));
    } else if (!statusData.defaultModelExists) {
      console.log(chalk.green.bold('ARK STATUS: ') + chalk.green('Ready') + chalk.gray(' (no default model configured)'));
    } else {
      console.log(chalk.green.bold('ARK STATUS: ') + chalk.green('Ready'));
    }

    // Print dependencies status first
    console.log(chalk.cyan.bold('\nsystem dependencies:'));
    for (const dep of statusData.dependencies) {
      StatusFormatter.printDependency(dep);
    }

    // Print cluster status
    console.log(chalk.cyan.bold('\ncluster access:'));
    if (statusData.clusterAccess && statusData.clusterInfo) {
      const clusterName =
        statusData.clusterInfo.context || 'kubernetes cluster';
      const clusterDetails = [];
      if (
        statusData.clusterInfo.type &&
        statusData.clusterInfo.type !== 'unknown'
      ) {
        clusterDetails.push(statusData.clusterInfo.type);
      }
      if (statusData.clusterInfo.ip) {
        clusterDetails.push(statusData.clusterInfo.ip);
      }

      console.log(
        `  ${chalk.green('✓ accessible')} ${chalk.bold.white(clusterName)}${clusterDetails.length > 0 ? chalk.gray(' ' + clusterDetails.join(', ')) : ''}`
      );
    } else if (statusData.clusterAccess) {
      console.log(
        `  ${chalk.green('✓ accessible')} ${chalk.bold('kubernetes cluster')}`
      );
    } else {
      console.log(
        `  ${chalk.red('✗ unreachable')} ${chalk.bold('kubernetes cluster')}`
      );
      console.log(
        `    ${chalk.gray('Install minikube: https://minikube.sigs.k8s.io/docs/start')}`
      );
    }

    // Only show ARK services if we have cluster access
    if (statusData.clusterAccess) {
      console.log(chalk.cyan.bold('\nark services:'));
      for (const service of statusData.services) {
        StatusFormatter.printService(service);
      }
    } else {
      console.log(chalk.cyan.bold('\nark services:'));
      console.log(
        `  ${chalk.gray('Cannot check ARK services - cluster not accessible')}`
      );
    }

    console.log();
  }

  private static printService(service: ServiceStatus): void {
    const statusColor =
      service.status === 'healthy'
        ? chalk.green('✓ healthy')
        : service.status === 'unhealthy'
          ? chalk.red('✗ unhealthy')
          : service.status === 'warning'
            ? chalk.yellow('⚠ warning')
            : service.status === 'not ready'
              ? chalk.yellow('○ not ready')
              : chalk.yellow('? not installed');

    // Show version and revision in grey after the name for healthy services
    let versionInfo = '';
    if (service.status === 'healthy' && (service.version || service.revision)) {
      const parts = [];
      if (service.version) parts.push(`v${service.version}`);
      if (service.revision) parts.push(`revision ${service.revision}`);
      versionInfo = chalk.gray(` ${parts.join(', ')}`);
    }

    // Show details inline in grey for all statuses
    let inlineDetails = '';
    if (service.details) {
      inlineDetails = chalk.gray(` ${service.details}`);
    }

    console.log(
      `  ${statusColor} ${chalk.bold(service.name)}${versionInfo}${inlineDetails}`
    );
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
