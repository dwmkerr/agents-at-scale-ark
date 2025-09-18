import {execa} from 'execa';

/**
 * Check if a command exists and is executable by running it with specified args
 */
export async function checkCommandExists(
  command: string,
  args: string[] = ['--version']
): Promise<boolean> {
  try {
    await execa(command, args);
    return true;
  } catch {
    return false;
  }
}
export {checkCommandExists as isCommandAvailable};
