import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { canCreateKeychain, createTempKeychain } from '../../test-utils/createTempKeychain.ts';

const ENTRY_POINT = path.join(import.meta.dirname, '../thor-secret.ts');

const SECRET = 's3cret';

const SERVICE = 'thor-secret-pipes-test';

const isMacos = process.platform === 'darwin';

describe('thor-secret over a pipe', () => {
  it.skipIf(!isMacos)('reads a secret whose producer writes after a delay', () => {
    // A blank secret is refused before `security` runs, so the test touches no keychain.
    const { stderr } = runPipeline(
      String.raw`{ sleep 0.3; printf '\n'; echo "producer-exit:$?" >&2; } | ${buildCommand(['set', SERVICE])}`,
    );

    expect(stderr).not.toMatch(/EAGAIN|EPIPE/);
    expect(stderr).toContain('producer-exit:0');
    expect(stderr).toContain('The secret is empty.');
  });

  it.skipIf(!canCreateKeychain)('stores what a delayed producer wrote, dropping the newline that it ends with', () => {
    using keychain = createTempKeychain();

    const stored = runPipeline(
      String.raw`{ sleep 0.3; printf '%s\n' ${quoteForShell(SECRET)}; echo "producer-exit:$?" >&2; } | ${buildCommand([
        'set',
        SERVICE,
        '--keychain',
        keychain.path,
      ])}`,
    );

    expect(stored.stderr).toBe('producer-exit:0\n');
    expect(stored.status).toBe(0);

    const read = spawnSync(process.execPath, [ENTRY_POINT, 'get', SERVICE, '--keychain', keychain.path], {
      encoding: 'utf8',
    });

    expect(read.stdout).toBe(`${SECRET}\n`);
  });

  it('ends quietly when the reader exits before the output is written', () => {
    // The `sleep` lets the reader exit first, so the CLI writes to a pipe that is already closed.
    const { status, stderr } = runPipeline(`{ sleep 0.1; ${buildCommand(['--help'])}; echo "exit:$?" >&2; } | true`);

    expect(stderr).toBe('exit:0\n');
    expect(status).toBe(0);
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
