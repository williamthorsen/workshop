import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { compileConfig } from '../compileConfig.ts';

const FIXTURES_DIR = path.resolve(import.meta.dirname, 'fixtures');
const FIXTURE_PATH = path.join(FIXTURES_DIR, 'discoverWorkspaces-fixture.ts');
const HOOK_SOURCE_PATH = path.resolve(import.meta.dirname, '..', '..', 'readyupResolverHook.ts');
const WRAPPER_PATH = path.join(FIXTURES_DIR, 'discoverWorkspaces-subprocess-wrapper.mjs');

const BUNDLE_SIZE_LIMIT_BYTES = 2 * 1_024;

/** Result of running a child process. */
interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Spawns `node` with the given arguments and returns its collected stdio. */
function spawnNode(args: string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({
        exitCode,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });
  });
}

const it = baseIt
  .extend(
    'temp',
    { scope: 'file' },
    makeFixture(() => createTempTree({}, { prefix: 'external-readyup-' })),
  )
  .extend('built', { scope: 'file' }, async ({ temp }): Promise<BuiltFixture> => {
    const compiledFixturePath = temp.resolve('discoverWorkspaces-fixture.js');
    const hookOutputPath = temp.resolve('readyupResolverHook.js');

    // Compile the fixture with the production compileConfig pipeline so the
    // assertions exercise exactly what kit authors will ship.
    await compileConfig(FIXTURE_PATH, compiledFixturePath);

    // Build the resolver hook for the subprocess to register. The hook source
    // has no imports, so esbuild is overkill; a TypeScript-strip via esbuild
    // gives a self-contained JS module without depending on a prior `nmr build`.
    const esbuild = await import('esbuild');
    await esbuild.build({
      entryPoints: [HOOK_SOURCE_PATH],
      outfile: hookOutputPath,
      bundle: false,
      format: 'esm',
      platform: 'node',
      target: 'es2025',
    });

    const compiledSource = await readFile(compiledFixturePath, 'utf8');

    return {
      compiledFixturePath,
      compiledSize: Buffer.byteLength(compiledSource, 'utf8'),
      compiledSource,
      hookOutputPath,
    };
  });

/** The compiled fixture and resolver hook that the suite's one build produced. */
interface BuiltFixture {
  compiledFixturePath: string;
  compiledSize: number;
  compiledSource: string;
  hookOutputPath: string;
}

describe('readyup externalization + resolver hook', () => {
  it('preserves readyup specifiers as live imports in the compiled output', ({ built }) => {
    expect(built.compiledSource).toMatch(/from\s+["']readyup["']/);
    expect(built.compiledSource).toMatch(/from\s+["']readyup\/check-utils["']/);
  });

  it('compiles the fixture below the 2KB regression threshold', ({ built }) => {
    expect(built.compiledSize).toBeLessThan(BUNDLE_SIZE_LIMIT_BYTES);
  });

  it('resolves the externalized readyup import via the runner-registered hook in a subprocess', async ({
    built,
    temp,
  }) => {
    // Sanity-check that the temp directory is outside any reachable `node_modules/readyup`
    // tree. If the tree ever lands inside a project, this assertion would silently pass via
    // filesystem walk-up; surface that here for future maintainers. The comparison resolves
    // `tmpdir()` because the tree reports its realpath and `os.tmpdir()` is a symlink on macOS.
    expect(temp.dir.startsWith(realpathSync(tmpdir()))).toBe(true);

    const result = await spawnNode([WRAPPER_PATH, built.compiledFixturePath, built.hookOutputPath]);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('resolved-ok');
  });
});
