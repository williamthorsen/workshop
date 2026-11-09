import { homedir } from 'node:os';
import { join } from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { isAtRepoRootWith, isGitRepoWith } from '../repo-predicates.ts';
import { createFakeGit } from '../test-utils/fake-git.ts';

const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-repo-predicates-' })),
);

const NOT_A_REPO = Object.assign(new Error('fatal: not a git repository'), { code: 128 });

describe(isGitRepoWith, () => {
  it('returns false when the path does not exist, invoking git for nothing', async ({ temp }) => {
    const git = createFakeGit({ 'rev-parse --git-dir': '.git' });

    await expect(isGitRepoWith(git, join(temp.dir, 'missing'))).resolves.toBe(false);
    expect(git.runGit).not.toHaveBeenCalled();
  });

  it('returns true when `rev-parse --git-dir` succeeds', async ({ temp }) => {
    const git = createFakeGit({ 'rev-parse --git-dir': '.git' });

    await expect(isGitRepoWith(git, temp.dir)).resolves.toBe(true);
    expect(git.runGit).toHaveBeenCalledWith(temp.dir, 'rev-parse', '--git-dir');
  });

  it('returns false when `rev-parse --git-dir` fails on a non-repo directory', async ({ temp }) => {
    const git = createFakeGit({ 'rev-parse --git-dir': NOT_A_REPO });

    await expect(isGitRepoWith(git, temp.dir)).resolves.toBe(false);
  });

  it('expands `~` in the path before invoking git', async () => {
    const git = createFakeGit({ 'rev-parse --git-dir': '.git' });

    await isGitRepoWith(git, '~');

    expect(git.runGit).toHaveBeenCalledWith(homedir(), 'rev-parse', '--git-dir');
  });
});

describe(isAtRepoRootWith, () => {
  it('returns false when the path does not exist, invoking git for nothing', async ({ temp }) => {
    const git = createFakeGit({ 'rev-parse --show-cdup': '' });

    await expect(isAtRepoRootWith(git, join(temp.dir, 'missing'))).resolves.toBe(false);
    expect(git.runGit).not.toHaveBeenCalled();
  });

  it('returns true when `rev-parse --show-cdup` returns an empty string', async ({ temp }) => {
    const git = createFakeGit({ 'rev-parse --show-cdup': '' });

    await expect(isAtRepoRootWith(git, temp.dir)).resolves.toBe(true);
    expect(git.runGit).toHaveBeenCalledWith(temp.dir, 'rev-parse', '--show-cdup');
  });

  it('returns false inside a subdirectory of a repo (cdup is non-empty)', async ({ temp }) => {
    const git = createFakeGit({ 'rev-parse --show-cdup': '../' });

    await expect(isAtRepoRootWith(git, temp.dir)).resolves.toBe(false);
  });

  it('returns false on a non-repo directory', async ({ temp }) => {
    const git = createFakeGit({ 'rev-parse --show-cdup': NOT_A_REPO });

    await expect(isAtRepoRootWith(git, temp.dir)).resolves.toBe(false);
  });

  it('expands `~` in the path before invoking git', async () => {
    const git = createFakeGit({ 'rev-parse --show-cdup': '' });

    await isAtRepoRootWith(git, '~');

    expect(git.runGit).toHaveBeenCalledWith(homedir(), 'rev-parse', '--show-cdup');
  });
});
