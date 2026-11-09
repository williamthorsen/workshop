import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

const ENTRY_POINT = path.join(import.meta.dirname, '../thor-npm.ts');

describe('thor-npm over a pipe', () => {
  it('ends quietly when the reader exits before the output is written', () => {
    // The `sleep` lets the reader exit first, so the CLI writes to a pipe that is already closed.
    const { status, stderr } = runPipeline(`{ sleep 0.1; ${buildCommand(['--help'])}; echo "exit:$?" >&2; } | true`);

    expect(stderr).toBe('exit:0\n');
    expect(status).toBe(0);
  });

  it('refuses to move a trust when stdin and stdout are pipes, before running npm', () => {
    const command = buildCommand(['move-trust', '@scope/pkg', '--from', 'owner/old', '--to', 'owner/new', '--force']);
    // An empty PATH makes any npm call fail, so a refusal that comes later than the terminal check would show.
    const { stderr } = runPipeline(`{ echo | PATH= ${command}; echo "exit:$?" >&2; } | cat`);

    expect(stderr).toContain('needs a terminal on stdin and stdout');
    expect(stderr).toMatch(/exit:2\n$/);
  });

  it("lists the working directory's workspace packages without cutting lines when stdout is a pipe", () => {
    const description = `A description longer than any terminal line, ${'repeated '.repeat(20)}`.trimEnd();
    using tree = createTempTree({
      'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
      'packages/alpha/package.json': JSON.stringify({ name: 'alpha', version: '1.0.0', description }),
    });

    const { status, stdout } = runPipeline(`cd ${quoteForShell(tree.dir)} && ${buildCommand(['list-packages'])} | cat`);

    expect(status).toBe(0);
    expect(stdout).toContain(`yes      alpha  1.0.0    alpha      ${description}\n`);
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
