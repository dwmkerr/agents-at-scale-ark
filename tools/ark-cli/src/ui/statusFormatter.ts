import chalk from 'chalk';
import {StatusData, ServiceStatus, DependencyStatus} from '../lib/types.js';

export class StatusFormatter {
  /**
   * Print status check results to console
   */
  public static printStatus(
    statusData: StatusData & {clusterAccess?: boolean; clusterInfo?: any}
  ): void {
    console.log();

    // Print dependencies status first
    console.log(chalk.cyan.bold('system dependencies:'));
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
      // Show all services except ark-controller (already shown in ark status)
      for (const service of statusData.services) {
        if (service.name !== 'ark-controller') {
          StatusFormatter.printService(service);
        }
      }
    } else {
      console.log(chalk.cyan.bold('\nark services:'));
      console.log(
        `  ${chalk.gray('Cannot check ARK services - cluster not accessible')}`
      );
    }

    // Print ARK status section
    console.log(chalk.cyan.bold('\nark status:'));
    if (!statusData.clusterAccess) {
      console.log(
        `  ${chalk.red('✗ no cluster access')}`
      );
    } else {
      // Show ark-controller status
      const controllerStatus = statusData.services?.find(s => s.name === 'ark-controller');
      if (controllerStatus) {
        StatusFormatter.printService(controllerStatus);
      } else {
        console.log(
          `  ${chalk.yellow('? not installed')} ${chalk.bold('ark-controller')}`
        );
      }

      // Show overall ARK readiness
      if (statusData.arkReady) {
        if (!statusData.defaultModelExists) {
          console.log(
            `  ${chalk.green('✓ ready')} ${chalk.gray('(no default model configured)')}`
          );
        } else {
          console.log(
            `  ${chalk.green('✓ ready')}`
          );
        }
      } else {
        console.log(
          `  ${chalk.yellow('○ not ready')}`
        );
      }
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
