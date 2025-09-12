import {exec} from 'child_process';
import {promisify} from 'util';

const execAsync = promisify(exec);

/**
 * Check if a command is available in the system
 */
export async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const checkCommand =
      process.platform === 'win32'
        ? `where ${command}`
        : `command -v ${command}`;
    await execAsync(checkCommand);
    return true;
  } catch (_error) {
    return false;
  }
}
