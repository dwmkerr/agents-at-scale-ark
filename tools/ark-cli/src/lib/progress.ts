/**
 * Progress indicators and user experience utilities for ARK CLI
 */

import chalk from 'chalk';

export interface ProgressStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  message?: string;
  duration?: number;
}

export class ProgressIndicator {
  private steps: ProgressStep[] = [];
  private startTime: number = Date.now();

  constructor(private title: string) {
    console.log(chalk.blue(`\n🚀 ${this.title}\n`));
  }

  /**
   * Add a step to the progress indicator
   */
  addStep(name: string, message?: string): void {
    this.steps.push({
      name,
      status: 'pending',
      message,
    });
  }

  /**
   * Start a step
   */
  startStep(name: string, message?: string): void {
    const step = this.steps.find((s) => s.name === name);
    if (step) {
      step.status = 'running';
      step.message = message;
      this.renderProgress();
    }
  }

  /**
   * Complete a step
   */
  completeStep(name: string, message?: string): void {
    const step = this.steps.find((s) => s.name === name);
    if (step) {
      step.status = 'completed';
      step.message = message;
      this.renderProgress();
    }
  }

  /**
   * Fail a step
   */
  failStep(name: string, message?: string): void {
    const step = this.steps.find((s) => s.name === name);
    if (step) {
      step.status = 'failed';
      step.message = message;
      this.renderProgress();
    }
  }

  /**
   * Skip a step
   */
  skipStep(name: string, message?: string): void {
    const step = this.steps.find((s) => s.name === name);
    if (step) {
      step.status = 'skipped';
      step.message = message;
      this.renderProgress();
    }
  }

  /**
   * Render the current progress
   */
  private renderProgress(): void {
    // Clear previous output (simple version)
    process.stdout.write('\r\x1b[K');

    for (const step of this.steps) {
      const icon = this.getStatusIcon(step.status);
      const color = this.getStatusColor(step.status);
      const statusText = step.message || step.name;

      console.log(`${icon} ${chalk[color](statusText)}`);
    }

    // Move cursor back up to overwrite on next update
    if (this.steps.length > 1) {
      process.stdout.write(`\x1b[${this.steps.length}A`);
    }
  }

  /**
   * Complete the progress indicator
   */
  complete(message?: string): void {
    // Clear any remaining progress rendering
    process.stdout.write('\r\x1b[K');

    // Only print failed or skipped steps - hide successful validation
    const importantSteps = this.steps.filter(
      (step) => step.status === 'failed' || step.status === 'skipped'
    );

    for (const step of importantSteps) {
      const icon = this.getStatusIcon(step.status);
      const color = this.getStatusColor(step.status);
      const statusText = step.message || step.name;

      console.log(`${icon} ${chalk[color](statusText)}`);
    }

    const duration = Date.now() - this.startTime;
    const durationText =
      duration > 1000 ? `${(duration / 1000).toFixed(1)}s` : `${duration}ms`;

    // Only show completion message if there were issues or if verbose
    if (importantSteps.length > 0) {
      console.log(
        chalk.green(
          `\n✅ ${message || this.title} completed in ${durationText}\n`
        )
      );
    }
  }

  /**
   * Get status icon for a step
   */
  private getStatusIcon(status: ProgressStep['status']): string {
    switch (status) {
      case 'pending':
        return chalk.gray('⏳');
      case 'running':
        return chalk.blue('🔄');
      case 'completed':
        return chalk.green('✅');
      case 'failed':
        return chalk.red('❌');
      case 'skipped':
        return chalk.yellow('⏭️');
      default:
        return '❓';
    }
  }

  /**
   * Get status color for a step
   */
  private getStatusColor(
    status: ProgressStep['status']
  ): 'gray' | 'blue' | 'green' | 'red' | 'yellow' {
    switch (status) {
      case 'pending':
        return 'gray';
      case 'running':
        return 'blue';
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      case 'skipped':
        return 'yellow';
      default:
        return 'gray';
    }
  }
}

/**
 * Simple spinner for long-running operations
 */
export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private index = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    this.interval = setInterval(() => {
      process.stdout.write(
        `\r${chalk.blue(this.frames[this.index])} ${this.message}`
      );
      this.index = (this.index + 1) % this.frames.length;
    }, 100);
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write(
      `\r\x1b[K${finalMessage ? chalk.green(`✅ ${finalMessage}`) : ''}\n`
    );
  }

  fail(errorMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write(
      `\r\x1b[K${errorMessage ? chalk.red(`❌ ${errorMessage}`) : ''}\n`
    );
  }
}

/**
 * Enhanced prompts with better validation and user guidance
 */
export class EnhancedPrompts {
  /**
   * Show a helpful tip to the user
   */
  static showTip(message: string): void {
    console.log(chalk.cyan(`💡 Tip: ${message}`));
  }

  /**
   * Show a warning to the user
   */
  static showWarning(message: string): void {
    console.log(chalk.yellow(`⚠️  Warning: ${message}`));
  }

  /**
   * Show information to the user
   */
  static showInfo(message: string): void {
    console.log(chalk.blue(`ℹ️  ${message}`));
  }

  /**
   * Show a success message
   */
  static showSuccess(message: string): void {
    console.log(chalk.green(`✅ ${message}`));
  }

  /**
   * Show available options for a choice
   */
  static showChoiceHelp(
    title: string,
    choices: Array<{name: string; description: string}>
  ): void {
    console.log(chalk.cyan(`\n📋 ${title}:`));
    choices.forEach((choice) => {
      console.log(
        chalk.gray(`  • ${chalk.white(choice.name)}: ${choice.description}`)
      );
    });
    console.log();
  }

  /**
   * Show next steps after completion
   */
  static showNextSteps(title: string, steps: string[]): void {
    console.log(chalk.cyan(`\n📋 ${title}:`));
    steps.forEach((step, index) => {
      console.log(chalk.gray(`  ${index + 1}. ${step}`));
    });
    console.log();
  }

  /**
   * Show a separator for better visual organization
   */
  static showSeparator(title?: string): void {
    if (title) {
      console.log(chalk.gray(`\n${'─'.repeat(50)}`));
      console.log(chalk.cyan(`${title}`));
      console.log(chalk.gray(`${'─'.repeat(50)}\n`));
    } else {
      console.log(chalk.gray(`${'─'.repeat(50)}`));
    }
  }
}

/**
 * Utility for consistent formatting of output
 */
export class OutputFormatter {
  /**
   * Format a list of key-value pairs
   */
  static formatKeyValueList(
    items: Array<{key: string; value: string; highlight?: boolean}>
  ): void {
    const maxKeyLength = Math.max(...items.map((item) => item.key.length));

    items.forEach((item) => {
      const paddedKey = item.key.padEnd(maxKeyLength);
      const color = item.highlight ? 'cyan' : 'gray';
      console.log(`  ${chalk[color](paddedKey)}: ${chalk.white(item.value)}`);
    });
  }

  /**
   * Format a file list with icons
   */
  static formatFileList(
    files: Array<{
      path: string;
      type: 'file' | 'directory';
      description?: string;
    }>
  ): void {
    files.forEach((file) => {
      const icon = file.type === 'directory' ? '📁' : '📄';
      const description = file.description
        ? chalk.gray(` - ${file.description}`)
        : '';
      console.log(`  ${icon} ${chalk.white(file.path)}${description}`);
    });
  }

  /**
   * Format command examples
   */
  static formatCommands(
    title: string,
    commands: Array<{command: string; description: string}>
  ): void {
    console.log(chalk.cyan(`\n${title}:`));
    commands.forEach((cmd) => {
      console.log(`  ${chalk.yellow(cmd.command)}`);
      console.log(chalk.gray(`    ${cmd.description}\n`));
    });
  }
}
