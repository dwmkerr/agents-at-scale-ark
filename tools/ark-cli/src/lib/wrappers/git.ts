import * as path from 'path';

import chalk from 'chalk';
import {simpleGit, SimpleGit} from 'simple-git';

import {ARK_REPO_ERROR_MESSAGE} from '../consts.js';

// Initialize simple-git instance
const git: SimpleGit = simpleGit();

export async function ensureInArkRepo(
  expectedRepoName: string,
  expectedRemoteSubstring?: string
): Promise<void> {
  try {
    // Get repository root
    const gitRoot = await git.revparse(['--show-toplevel']);

    if (path.basename(gitRoot) !== expectedRepoName) {
      console.error(chalk.red(ARK_REPO_ERROR_MESSAGE));
      process.exit(1);
    }

    if (expectedRemoteSubstring) {
      try {
        // Get remote URL
        const remoteUrl = await git.remote(['get-url', 'origin']);

        if (!remoteUrl || !remoteUrl.includes(expectedRemoteSubstring)) {
          console.error(chalk.red(ARK_REPO_ERROR_MESSAGE));
          process.exit(1);
        }
      } catch (_error) {
        console.error(chalk.red(ARK_REPO_ERROR_MESSAGE));
        process.exit(1);
      }
    }
  } catch (_error) {
    console.error(chalk.red(ARK_REPO_ERROR_MESSAGE));
    process.exit(1);
  }
}

export async function getRepoProjectRoot(): Promise<string> {
  try {
    return await git.revparse(['--show-toplevel']);
  } catch (_error) {
    console.error(chalk.red('Failed to determine git repository root path'));
    process.exit(1);
  }
}
