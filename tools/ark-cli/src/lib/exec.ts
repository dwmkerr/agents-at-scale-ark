import fs from 'fs';

import {execa} from 'execa';

export async function executeCommand(
  command: string,
  args: string[] = []
): Promise<{stdout: string; stderr: string}> {
  try {
    const result = await execa(command, args);
    return {stdout: result.stdout, stderr: result.stderr};
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Command failed: ${command} ${args.join(' ')}\n${errorMessage}`
    );
  }
}

export function fileExists(path: string): boolean {
  try {
    return fs.existsSync(path);
  } catch {
    return false;
  }
}
