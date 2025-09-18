import {Command} from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import type {ArkConfig} from '../../lib/config.js';
import {StatusChecker} from '../../components/statusChecker.js';
import {StatusFormatter, StatusSection, StatusColor} from '../../ui/statusFormatter.js';
import {StatusData} from '../../lib/types.js';

function buildStatusSections(data: StatusData & {clusterAccess?: boolean; clusterInfo?: any}): StatusSection[] {
  const sections: StatusSection[] = [];

  // Dependencies section
  sections.push({
    title: 'system dependencies:',
    lines: data.dependencies.map(dep => ({
      icon: dep.installed ? '✓' : '✗',
      iconColor: (dep.installed ? 'green' : 'red') as StatusColor,
      status: dep.installed ? 'installed' : 'missing',
      statusColor: (dep.installed ? 'green' : 'red') as StatusColor,
      name: chalk.bold(dep.name),
      details: dep.version || '',
      subtext: dep.installed ? undefined : dep.details,
    })),
  });

  // Cluster access section
  const clusterLines = [];
  if (data.clusterAccess) {
    const contextName = data.clusterInfo?.context || 'kubernetes cluster';
    const namespace = data.clusterInfo?.namespace || 'default';
    // Add bold context name with blue namespace
    const name = `${chalk.bold(contextName)} ${chalk.blue(namespace)}`;
    const details = [];
    if (data.clusterInfo?.type && data.clusterInfo.type !== 'unknown') {
      details.push(data.clusterInfo.type);
    }
    if (data.clusterInfo?.ip) {
      details.push(data.clusterInfo.ip);
    }
    clusterLines.push({
      icon: '✓',
      iconColor: 'green' as StatusColor,
      status: 'accessible',
      statusColor: 'green' as StatusColor,
      name,
      details: details.join(', '),
    });
  } else {
    clusterLines.push({
      icon: '✗',
      iconColor: 'red' as StatusColor,
      status: 'unreachable',
      statusColor: 'red' as StatusColor,
      name: 'kubernetes cluster',
      subtext: 'Install minikube: https://minikube.sigs.k8s.io/docs/start',
    });
  }
  sections.push({ title: 'cluster access:', lines: clusterLines });

  // Ark services section
  if (data.clusterAccess) {
    const serviceLines = data.services
      .filter(s => s.name !== 'ark-controller')
      .map(service => {
        const statusMap: Record<string, {icon: string; text: string; color: StatusColor}> = {
          'healthy': { icon: '✓', text: 'healthy', color: 'green' },
          'unhealthy': { icon: '✗', text: 'unhealthy', color: 'red' },
          'warning': { icon: '⚠', text: 'warning', color: 'yellow' },
          'not ready': { icon: '○', text: 'not ready', color: 'yellow' },
          'not installed': { icon: '?', text: 'not installed', color: 'yellow' },
        };
        const status = statusMap[service.status] || { icon: '?', text: service.status, color: 'yellow' as StatusColor };

        const details = [];
        if (service.status === 'healthy') {
          if (service.version) details.push(`v${service.version}`);
          if (service.revision) details.push(`revision ${service.revision}`);
        }
        if (service.details) details.push(service.details);

        // Build name with bold service name, blue namespace, and dev indicator
        let displayName = chalk.bold(service.name);
        if (service.namespace) {
          displayName += ` ${chalk.blue(service.namespace)}`;
        }
        if (service.isDev) {
          displayName += ' (dev)';
        }

        return {
          icon: status.icon,
          iconColor: status.color,
          status: status.text,
          statusColor: status.color,
          name: displayName,
          details: details.join(', '),
        };
      });
    sections.push({ title: 'ark services:', lines: serviceLines });
  } else {
    sections.push({
      title: 'ark services:',
      lines: [{
        icon: '',
        status: '',
        name: 'Cannot check ARK services - cluster not accessible',
      }],
    });
  }

  // Ark status section
  const arkStatusLines = [];
  if (!data.clusterAccess) {
    arkStatusLines.push({
      icon: '✗',
      iconColor: 'red' as StatusColor,
      status: 'no cluster access',
      statusColor: 'red' as StatusColor,
      name: ''
    });
  } else {
    const controller = data.services?.find(s => s.name === 'ark-controller');
    if (!controller) {
      arkStatusLines.push({
        icon: '○',
        iconColor: 'yellow' as StatusColor,
        status: 'not ready',
        statusColor: 'yellow' as StatusColor,
        name: 'ark-controller'
      });
    } else if (controller.status === 'not installed') {
      arkStatusLines.push({
        icon: '○',
        iconColor: 'yellow' as StatusColor,
        status: 'not ready',
        statusColor: 'yellow' as StatusColor,
        name: 'ark-controller',
        details: controller.details || '',
      });
    } else if (controller.status === 'healthy') {
      arkStatusLines.push({
        icon: '✓',
        iconColor: 'green' as StatusColor,
        status: 'ready',
        statusColor: 'green' as StatusColor,
        name: chalk.bold('ark-controller') + (controller.namespace ? ` ${chalk.blue(controller.namespace)}` : '') + (controller.isDev ? ' (dev)' : ''),
        details: controller.details || '',
        subtext: !data.defaultModelExists ? '(no default model configured)' : undefined,
      });
    } else {
      const statusMap: Record<string, {icon: string; color: StatusColor}> = {
        'unhealthy': { icon: '✗', color: 'red' },
        'warning': { icon: '⚠', color: 'yellow' },
        'not ready': { icon: '○', color: 'yellow' },
      };
      const status = statusMap[controller.status] || { icon: '?', color: 'yellow' as StatusColor };
      arkStatusLines.push({
        icon: status.icon,
        iconColor: status.color,
        status: controller.status,
        statusColor: status.color,
        name: 'ark-controller',
        details: controller.details || '',
      });
    }
  }
  sections.push({ title: 'ark status:', lines: arkStatusLines });

  return sections;
}

export async function checkStatus() {
  const spinner = ora('Checking system status').start();

  try {
    spinner.text = 'Checking system dependencies';
    const statusChecker = new StatusChecker();

    spinner.text = 'Testing cluster access';

    spinner.text = 'Checking ARK services';
    const statusData = await statusChecker.checkAll();

    spinner.stop();

    const sections = buildStatusSections(statusData);
    StatusFormatter.printSections(sections);
    process.exit(0);
  } catch (error) {
    spinner.fail('Failed to check status');
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}

export function createStatusCommand(_: ArkConfig): Command {
  const statusCommand = new Command('status');
  statusCommand.description('Check ARK system status').action(checkStatus);

  return statusCommand;
}
