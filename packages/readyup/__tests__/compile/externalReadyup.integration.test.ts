import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { compileConfig } from '../../src/compile/compileConfig.ts';

const FIXTURES_DIR = path.resolve(import.meta.dirname, 'fixtures');
const FIXTURE_PATH = path.join(FIXTURES_DIR, 'discoverWorkspaces-fixture.ts');
const HOOK_SOURCE_PATH = path.resolve(import.meta.dirname, '..', '..', 'src', 'readyupResolverHook.ts');
const WRAPPER_PATH = path.join(FIXTURES_DIR, 'discoverWorkspaces-subprocess-wrapper.mjs');

const BUNDLE_SIZE_LIMIT_BYTES = 2 * 1024;

/** Result of running a child process. */
interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Spawn `node` with the given arguments and collect stdio. */
function spawnNode(args: string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
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

describe('readyup externalization + resolver-hook integration', () => {
  let outputDir: string;
  let compiledFixturePath: string;
  let hookOutputPath: string;
  let compiledSource: string;
  let compiledSize: number;

  beforeAll(async () => {
    outputDir = await mkdtemp(path.join(tmpdir(), 'external-readyup-'));
    compiledFixturePath = path.join(outputDir, 'discoverWorkspaces-fixture.js');
    hookOutputPath = path.join(outputDir, 'readyupResolverHook.js');

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
      target: 'es2022',
    });

    compiledSource = await readFile(compiledFixturePath, 'utf8');
    compiledSize = Buffer.byteLength(compiledSource, 'utf8');
  });

  afterAll(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("preserves the bare 'readyup' import as a live specifier in the compiled output", () => {
    expect(compiledSource).toMatch(/from\s+["']readyup["']/);
  });

  it('compiles the fixture below the 2KB regression threshold', () => {
    expect(compiledSize).toBeLessThan(BUNDLE_SIZE_LIMIT_BYTES);
  });

  it('resolves the externalized readyup import via the runner-registered hook in a subprocess', async () => {
    // Sanity-check that the temp directory is outside any reachable `node_modules/readyup`
    // tree. If `mkdtemp(tmpdir())` ever drops the bundle inside a project, this assertion
    // would silently pass via filesystem walk-up; surface that here for future maintainers.
    expect(outputDir.startsWith(tmpdir())).toBe(true);

    const result = await spawnNode([WRAPPER_PATH, compiledFixturePath, hookOutputPath]);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('resolved-ok');
  });
});
