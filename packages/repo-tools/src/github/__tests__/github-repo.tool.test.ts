import fs from 'node:fs';
import process from 'node:process';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { createGhReader } from '../github-repo.ts';

describe(createGhReader, () => {
  it('reads the visibility and decodes the runner variable', () => {
    using bin = fakeGh({ repo: { stdout: 'private' }, variable: { stdout: '"imac2"' } });
    expect(createGhReader(bin.env)('owner/app')).toStrictEqual({
      runner: 'imac2',
      runnerProblem: undefined,
      visibility: 'private',
    });
  });

  it('reads an unset variable from a 404 as no runner', () => {
    using bin = fakeGh({
      repo: { stdout: 'public' },
      variable: { status: 1, stderr: 'gh: Not Found (HTTP 404)' },
    });
    expect(createGhReader(bin.env)('owner/app')).toStrictEqual({
      runner: undefined,
      runnerProblem: undefined,
      visibility: 'public',
    });
  });

  it('reports an unsupported variable value without failing the read', () => {
    using bin = fakeGh({ repo: { stdout: 'public' }, variable: { stdout: '["self-hosted"]' } });
    expect(createGhReader(bin.env)('owner/app')).toStrictEqual({
      runner: undefined,
      runnerProblem: 'selects more than one label: ["self-hosted"]',
      visibility: 'public',
    });
  });

  it('fails the read on any other variable error', () => {
    using bin = fakeGh({
      repo: { stdout: 'public' },
      variable: { status: 1, stderr: 'gh: Resource not accessible (HTTP 403)\nmore' },
    });
    expect(createGhReader(bin.env)('owner/app')).toBe('gh: Resource not accessible (HTTP 403)');
  });

  it('fails the read when the repo cannot be read, without reading the variable', () => {
    using bin = fakeGh({ repo: { status: 1, stderr: 'gh: Not Found (HTTP 404)' }, variable: { stdout: 'never' } });
    expect(createGhReader(bin.env)('owner/app')).toBe('gh: Not Found (HTTP 404)');
  });

  it('reports a gh that cannot be started', () => {
    expect(createGhReader({ PATH: '/nonexistent' })('owner/app')).toMatch(/^cannot run gh: /);
  });
});

// region | Helpers

/** The output of one fake `gh api` call. */
interface FakeCall {
  status?: number;
  stderr?: string;
  stdout?: string;
}

/**
 * Writes a `gh` script that answers `api repos/<repo>` and `api repos/<repo>/actions/variables/CI_RUNS_ON` with the
 * given outputs, and returns an environment that puts it first on `PATH`.
 */
function fakeGh(calls: { repo: FakeCall; variable: FakeCall }): Disposable & {
  env: Record<string, string | undefined>;
} {
  const script = `#!/bin/sh
case "$2" in
  */actions/variables/CI_RUNS_ON) ${renderCall(calls.variable)} ;;
  *) ${renderCall(calls.repo)} ;;
esac
`;
  const tree = createTempTree({ 'bin/gh': script }, { prefix: 'repo-tools-gh-' });
  fs.chmodSync(tree.resolve('bin/gh'), 0o755);
  return {
    env: { PATH: `${tree.resolve('bin')}:${process.env['PATH'] ?? ''}` },
    [Symbol.dispose]: () => tree[Symbol.dispose](),
  };
}

/** Renders the shell commands that print a call's output and exit with its status. */
function renderCall(call: FakeCall): string {
  return String.raw`printf '%s\n' '${call.stdout ?? ''}'; printf '%s\n' '${call.stderr ?? ''}' >&2; exit ${call.status ?? 0}`;
}

// endregion | Helpers
