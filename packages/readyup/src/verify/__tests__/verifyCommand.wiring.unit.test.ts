import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { richFormatter } from '../../layout/richFormatter.ts';
import { VerifyOutputSchema } from '../../schemas/verifyOutputSchema.ts';
import { hashBytes, hashProjection } from '../targetHash.ts';
import { verifyCommand } from '../verifyCommand.ts';

/**
 * Exercises the full `verifyCommand → checkDrift → hashFile → filesystem` chain against real files in
 * a tempdir, without mocking the drift helper. Unit tests cover the branches; this locks in the wiring
 * (e.g., that `manifestDir` is threaded through correctly).
 */
const OK = richFormatter.tokens.passed.glyph;
const FAILED = richFormatter.tokens.failedError.glyph;

describe('verifyCommand wiring', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'verify-integ-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns 0 and reports ok when on-disk compiled kit matches manifest targetHash', async () => {
    const compiled = Buffer.from('export default { checks: [] };\n');
    writeFileSync(path.join(tempDir, 'demo.js'), compiled);
    const manifestPath = path.join(tempDir, 'manifest.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        kits: [{ name: 'demo', path: 'demo.js', source: 'demo.ts', targetHash: hashBytes(compiled) }],
      }),
    );

    const { exitCode, stdout, stderr } = await verify(['--manifest', 'manifest.json']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`${OK} demo`);
    expect(stderr).toBe('');
  });

  it('returns 1 and reports drift when on-disk compiled kit differs from manifest targetHash', async () => {
    writeFileSync(path.join(tempDir, 'demo.js'), 'export default { edited: true };\n');
    const manifestPath = path.join(tempDir, 'manifest.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        kits: [{ name: 'demo', path: 'demo.js', source: 'demo.ts', targetHash: 'deadbeef' }],
      }),
    );

    const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

    expect(exitCode).toBe(1);
    expect(stdout).toContain(`${FAILED} demo\n   drift`);
    expect(stdout).toContain('expected deadbeef');
  });

  describe('source staleness', () => {
    /**
     * Writes a matching source/output pair and a manifest recording both hashes, returning the
     * source path.
     *
     * Editing that source is the whole scenario: a kit whose TypeScript moved on while the compiled
     * bundle it was built from stayed put.
     */
    function writeCompiledPair(): string {
      const compiled = Buffer.from('export default { checklists: [] };\n');
      const source = Buffer.from('export default defineRdyKit({ checklists: [] });\n');
      const sourcePath = path.join(tempDir, 'demo.ts');
      writeFileSync(path.join(tempDir, 'demo.js'), compiled);
      writeFileSync(sourcePath, source);
      writeFileSync(
        path.join(tempDir, 'manifest.json'),
        JSON.stringify({
          version: 1,
          kits: [
            {
              name: 'demo',
              path: 'demo.js',
              source: 'demo.ts',
              sourceHash: hashBytes(source),
              targetHash: hashBytes(compiled),
            },
          ],
        }),
      );
      return sourcePath;
    }

    it('returns 0 when both the source and the compiled kit match the manifest', async () => {
      writeCompiledPair();

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} demo`);
    });

    it('returns 1 when the source was edited without a recompile', async () => {
      const sourcePath = writeCompiledPair();
      writeFileSync(sourcePath, 'export default defineRdyKit({ checklists: [], failOn: "warn" });\n');

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} demo\n   source stale`);
    });

    it('returns 1 when the recorded source was deleted', async () => {
      const sourcePath = writeCompiledPair();
      rmSync(sourcePath);

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} demo\n   source file missing`);
    });

    it('reports both source hashes in the JSON entry for a stale kit', async () => {
      const sourcePath = writeCompiledPair();
      const edited = Buffer.from('export default defineRdyKit({ checklists: [], failOn: "warn" });\n');
      writeFileSync(sourcePath, edited);

      const { stdout } = await verify(['--manifest', 'manifest.json', '--json']);

      expect(JSON.parse(stdout)).toMatchObject({
        passed: false,
        kits: [
          {
            name: 'demo',
            status: 'ok',
            sourceStatus: 'stale',
            sourceActual: hashBytes(edited),
          },
        ],
      });
    });
  });

  describe('input staleness', () => {
    const SHARED_MODULE = Buffer.from('export const shared = 1;\n');
    const PACKAGE_JSON = { name: 'demo', version: '3.1.0' };

    /**
     * Writes a kit whose compile read a sibling module and a version out of `package.json`, and a
     * manifest recording all of it.
     *
     * The two hash verdicts are arranged to pass, so whatever the run reports comes from the closure.
     */
    function writeRecordedClosure(): void {
      const compiled = Buffer.from('export default { checklists: [] };\n');
      const source = Buffer.from('export default defineRdyKit({ checklists: [] });\n');
      writeFileSync(path.join(tempDir, 'demo.js'), compiled);
      writeFileSync(path.join(tempDir, 'demo.ts'), source);
      writeFileSync(path.join(tempDir, 'shared.ts'), SHARED_MODULE);
      writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(PACKAGE_JSON));
      writeFileSync(
        path.join(tempDir, 'manifest.json'),
        JSON.stringify({
          version: 1,
          kits: [
            {
              name: 'demo',
              path: 'demo.js',
              source: 'demo.ts',
              sourceHash: hashBytes(source),
              targetHash: hashBytes(compiled),
              inputs: [
                { hash: hashBytes(SHARED_MODULE), kind: 'module', path: 'shared.ts' },
                {
                  hash: hashProjection(JSON.stringify({ version: PACKAGE_JSON.version })),
                  kind: 'inline',
                  path: 'package.json',
                  paths: ['version'],
                },
              ],
            },
          ],
        }),
      );
    }

    it('returns 0 when every file the compile read still matches', async () => {
      writeRecordedClosure();

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} demo`);
    });

    it('returns 1 when a module the bundle inlined was edited without a recompile', async () => {
      writeRecordedClosure();
      writeFileSync(path.join(tempDir, 'shared.ts'), 'export const shared = 2;\n');

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} demo\n   input stale: shared.ts (module`);
    });

    it('returns 1 when the version the kit pinned to has moved', async () => {
      writeRecordedClosure();
      writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ ...PACKAGE_JSON, version: '4.0.0' }));

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} demo\n   input stale: package.json (inline`);
    });

    it('returns 0 when a field the kit did not pick was edited', async () => {
      writeRecordedClosure();
      writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ ...PACKAGE_JSON, name: 'renamed' }));

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} demo`);
    });

    it('passes the axis and every failure into the JSON entry, at the schema version it always emitted', async () => {
      writeRecordedClosure();
      writeFileSync(path.join(tempDir, 'shared.ts'), 'export const shared = 2;\n');
      writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'demo' }));

      const { stdout } = await verify(['--manifest', 'manifest.json', '--json']);

      expect(VerifyOutputSchema.parse(JSON.parse(stdout))).toMatchObject({
        schemaVersion: 1,
        passed: false,
        kits: [
          {
            name: 'demo',
            inputsStatus: 'stale',
            inputFailures: [
              { kind: 'module', path: 'shared.ts', reason: 'changed', expected: hashBytes(SHARED_MODULE) },
              {
                kind: 'inline',
                path: 'package.json',
                reason: 'unprojectable',
                detail: 'path not found: version',
              },
            ],
          },
        ],
      });
    });
  });

  describe('--json', () => {
    /** Writes a manifest naming one matching kit, one drifted kit, and one with no recorded hash. */
    function writeMixedManifest(): void {
      const clean = Buffer.from('export default { checks: [] };\n');
      writeFileSync(path.join(tempDir, 'clean.js'), clean);
      writeFileSync(path.join(tempDir, 'edited.js'), 'export default { edited: true };\n');
      writeFileSync(
        path.join(tempDir, 'manifest.json'),
        JSON.stringify({
          version: 1,
          kits: [
            { name: 'clean', path: 'clean.js', targetHash: hashBytes(clean) },
            { name: 'edited', path: 'edited.js', targetHash: 'deadbeef' },
            { name: 'gone', path: 'gone.js', targetHash: 'abcd1234' },
            { name: 'unhashed', path: 'clean.js' },
          ],
        }),
      );
    }

    it('reports every kit status with the hashes only a drift verdict compared', async () => {
      writeMixedManifest();

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json', '--json']);

      expect(exitCode).toBe(1);
      expect(JSON.parse(stdout)).toStrictEqual({
        schemaVersion: 1,
        passed: false,
        kits: [
          { name: 'clean', status: 'ok', sourceStatus: 'unverified', inputsStatus: 'unverified' },
          {
            name: 'edited',
            status: 'drift',
            expected: 'deadbeef',
            actual: expect.any(String),
            sourceStatus: 'unverified',
            inputsStatus: 'unverified',
          },
          { name: 'gone', status: 'missing', sourceStatus: 'unverified', inputsStatus: 'unverified' },
          { name: 'unhashed', status: 'unverified', sourceStatus: 'unverified', inputsStatus: 'unverified' },
        ],
      });
    });

    it('emits exactly one JSON document and sends the per-kit prose to stderr', async () => {
      writeMixedManifest();

      const { stdoutChunks, stderr } = await verify(['--manifest', 'manifest.json', '--json']);

      expect(stdoutChunks).toHaveLength(1);
      expect(stderr).toContain(`${OK} clean`);
    });

    it('passes when every kit is ok or unverified', async () => {
      const compiled = Buffer.from('export default { checks: [] };\n');
      writeFileSync(path.join(tempDir, 'demo.js'), compiled);
      writeFileSync(
        path.join(tempDir, 'manifest.json'),
        JSON.stringify({
          version: 1,
          kits: [
            { name: 'demo', path: 'demo.js', targetHash: hashBytes(compiled) },
            { name: 'unhashed', path: 'demo.js' },
          ],
        }),
      );

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json', '--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({ passed: true });
    });

    it('reports an empty manifest as a passing run with no kits', async () => {
      writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify({ version: 1, kits: [] }));

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json', '--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toStrictEqual({ schemaVersion: 1, passed: true, kits: [] });
    });
  });
});

// region | Helpers

/** Runs the command over the given arguments, returning its exit code alongside everything it wrote. */
async function verify(args: string[]) {
  using io = captureStdio();

  const exitCode = await verifyCommand(args);

  return { exitCode, stdout: io.stdout, stdoutChunks: io.stdoutChunks, stderr: io.stderr };
}

// endregion | Helpers
