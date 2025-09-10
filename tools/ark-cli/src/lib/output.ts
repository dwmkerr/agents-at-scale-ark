import chalk from 'chalk';

const output = {
  /**
   * Display an error message with consistent formatting
   */
  error(message: string, ...args: unknown[]): void {
    console.error(chalk.red('✗ error:'), message, ...args);
  },

  /**
   * Display a success message with consistent formatting
   */
  success(message: string, ...args: unknown[]): void {
    console.log(chalk.green('✓'), message, ...args);
  },

  /**
   * Display an info message (indented gray text)
   */
  info(message: string, ...args: unknown[]): void {
    console.log(chalk.gray(message), ...args);
  },

  /**
   * Display a warning message with consistent formatting
   */
  warning(message: string, ...args: unknown[]): void {
    console.log(
      chalk.yellow.bold('!'),
      chalk.yellow('warning:'),
      message,
      ...args
    );
  },
};

export default output;
