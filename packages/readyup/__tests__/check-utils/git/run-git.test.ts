import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { runGit } from '../../../src/check-utils/git/run-git.ts';

let tempDir: string;

function createTempRepo(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'rdy-git-'));
  execSync('git init', { cwd: tempDir, stdio: 'ignore' });
  execSync('git commit --allow-empty -m "init"', { cwd: tempDir, stdio: 'ignore' });
  return tempDir;
}

describe(runGit, () => {
  it('returns trimmed stdout for a successful git command', async () => {
    const repo = createTempRepo();
    const result = await runGit(repo, 'rev-parse', '--short', 'HEAD');

    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('throws when git exits with a nonzero code', async () => {
    const repo = createTempRepo();

    await expect(runGit(repo, 'rev-parse', '--verify', 'nonexistent-ref')).rejects.toThrow();
  });

  it('expands ~ to the home directory', async () => {
    // Verify tilde expansion produces the same result as homedir()
    // by running a command that works from any git repo (or fails consistently)
    const home = homedir();

    // If home is a git repo, both should succeed with same output.
    // If not, both should fail with the same error.
    const fromTilde = runGit('~', 'rev-parse', '--git-dir').catch((e: Error) => e.message);
    const fromHome = runGit(home, 'rev-parse', '--git-dir').catch((e: Error) => e.message);

    expect(await fromTilde).toBe(await fromHome);
  });

  it('expands ~/ prefix to the home directory', async () => {
    const home = homedir();

    const fromTilde = runGit('~/', 'rev-parse', '--git-dir').catch((e: Error) => e.message);
    const fromHome = runGit(home, 'rev-parse', '--git-dir').catch((e: Error) => e.message);

    expect(await fromTilde).toBe(await fromHome);
  });
});
