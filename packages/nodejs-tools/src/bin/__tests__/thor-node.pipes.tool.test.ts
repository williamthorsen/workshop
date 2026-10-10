import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

const ENTRY_POINT = path.join(import.meta.dirname, '../thor-node.ts');

describe('thor-node over a pipe', () => {
  it('ends quietly when the reader exits before the output is written', () => {
    // The `sleep` lets the reader exit first, so the CLI writes to a pipe that is already closed.
    const { status, stderr } = runPipeline(`{ sleep 0.1; ${buildCommand(['--help'])}; echo "exit:$?" >&2; } | true`);

    expect(stderr).toBe('exit:0\n');
    expect(status).toBe(0);
  });

  it('refuses to confirm prune-modules --apply when stdin is a pipe', () => {
    using tree = createTempTree({ 'repos/stale/node_modules/pkg/index.js': '' });
    const args = ['prune-modules', '--apply', '--no-active-guard', '--root', tree.resolve('repos')];

    const { status, stderr } = runPipeline(`echo y | ${buildCommand(args)}`);

    expect(stderr).toContain('Confirming --apply needs a terminal on stdin');
    expect(status).toBe(2);
    expect(tree.exists('repos/stale/node_modules')).toBe(true);
  });
});

// region | Helpers

/** Renders the shell command that runs the CLI's TypeScript entry point, whose types node strips. */
function buildCommand(args: string[]): string {
  return [process.execPath, ENTRY_POINT, ...args].map(quoteForShell).join(' ');
}

/** Wraps a value for `bash -c`, so that a path holding a space or a quote survives. */
function quoteForShell(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}

/**
 * Runs a shell pipeline, which puts a real OS pipe between the two processes. Piping one child's stdout
 * into another's stdin from here would route the bytes through this process, where neither end sees the other
 * close.
 */
function runPipeline(script: string): { status: number | null; stderr: string; stdout: string } {
  const { status, stderr, stdout } = spawnSync('bash', ['-c', script], { encoding: 'utf8' });

  return { status, stderr, stdout };
}

// endregion | Helpers
