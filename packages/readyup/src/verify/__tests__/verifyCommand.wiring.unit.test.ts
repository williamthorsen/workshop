import { captureStdio, createTempTree, pointCwdAt, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, describe, expect, it as baseIt, vi } from 'vitest';

import { richFormatter } from '../../layout/formatter.ts';
import { VerifyOutputSchema } from '../../schemas/verifyOutputSchema.ts';
import { hashBytes, hashProjection } from '../targetHash.ts';
import { verifyCommand } from '../verifyCommand.ts';

/**
 * Exercises the full `verifyCommand → checkDrift → hashFile → filesystem` chain against real files in
 * a tempdir, without mocking the drift helper. Unit tests cover the branches; this locks in the wiring
 * (e.g., that `manifestDir` is threaded through correctly).
 */
const OK = richFormatter.tokens.passed.text;
const FAILED = richFormatter.tokens.failedError.text;

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'verify-integ-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runTest();
});

describe('verifyCommand wiring', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 0 and reports ok when on-disk compiled kit matches manifest targetHash', async ({ temp }) => {
    const compiled = Buffer.from('export default { checks: [] };\n');
    temp.write('demo.js', compiled);
    temp.writeJson('manifest.json', {
      version: 1,
      kits: [{ name: 'demo', path: 'demo.js', source: 'demo.ts', targetHash: hashBytes(compiled) }],
    });

    const { exitCode, stdout, stderr } = await verify(['--manifest', 'manifest.json']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`${OK} demo`);
    expect(stderr).toBe('');
  });

  it('returns 1 and reports drift when on-disk compiled kit differs from manifest targetHash', async ({ temp }) => {
    temp.write('demo.js', 'export default { edited: true };\n');
    temp.writeJson('manifest.json', {
      version: 1,
      kits: [{ name: 'demo', path: 'demo.js', source: 'demo.ts', targetHash: 'deadbeef' }],
    });

    const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

    expect(exitCode).toBe(1);
    expect(stdout).toContain(`${FAILED} demo\n   drift`);
    expect(stdout).toContain('expected deadbeef');
  });

  describe('source staleness', () => {
    it('returns 0 when both the source and the compiled kit match the manifest', async ({ temp }) => {
      writeCompiledPair(temp);

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} demo`);
    });

    it('returns 1 when the source was edited without a recompile', async ({ temp }) => {
      writeCompiledPair(temp);
      temp.write('demo.ts', 'export default defineRdyKit({ checklists: [], failOn: "warn" });\n');

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} demo\n   source stale`);
    });

    it('returns 1 when the recorded source was deleted', async ({ temp }) => {
      writeCompiledPair(temp);
      temp.rm('demo.ts');

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} demo\n   source file missing`);
    });

    it('reports both source hashes in the JSON entry for a stale kit', async ({ temp }) => {
      writeCompiledPair(temp);
      const edited = Buffer.from('export default defineRdyKit({ checklists: [], failOn: "warn" });\n');
      temp.write('demo.ts', edited);

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
    it('returns 0 when every file read by the compile still matches', async ({ temp }) => {
      writeRecordedClosure(temp);

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} demo`);
    });

    it('returns 1 when a module inlined by the bundle was edited without a recompile', async ({ temp }) => {
      writeRecordedClosure(temp);
      temp.write('shared.ts', 'export const shared = 2;\n');

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} demo\n   input stale: shared.ts (module`);
    });

    it('returns 1 when the version to which the kit pinned has moved', async ({ temp }) => {
      writeRecordedClosure(temp);
      temp.writeJson('package.json', { ...PACKAGE_JSON, version: '4.0.0' });

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(1);
      expect(stdout).toContain(`${FAILED} demo\n   input stale: package.json (inline`);
    });

    it('returns 0 when a field not picked by the kit was edited', async ({ temp }) => {
      writeRecordedClosure(temp);
      temp.writeJson('package.json', { ...PACKAGE_JSON, name: 'renamed' });

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(`${OK} demo`);
    });

    it('passes the axis and every failure into the JSON entry, at the schema version it always emitted', async ({
      temp,
    }) => {
      writeRecordedClosure(temp);
      temp.write('shared.ts', 'export const shared = 2;\n');
      temp.writeJson('package.json', { name: 'demo' });

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
    it('reports every kit status with the hashes compared only by a drift verdict', async ({ temp }) => {
      writeMixedManifest(temp);

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

    it('emits exactly one JSON document and sends the per-kit prose to stderr', async ({ temp }) => {
      writeMixedManifest(temp);

      const { stdoutChunks, stderr } = await verify(['--manifest', 'manifest.json', '--json']);

      expect(stdoutChunks).toHaveLength(1);
      expect(stderr).toContain(`${OK} clean`);
    });

    it('passes when every kit is ok or unverified', async ({ temp }) => {
      const compiled = Buffer.from('export default { checks: [] };\n');
      temp.write('demo.js', compiled);
      temp.writeJson('manifest.json', {
        version: 1,
        kits: [
          { name: 'demo', path: 'demo.js', targetHash: hashBytes(compiled) },
          { name: 'unhashed', path: 'demo.js' },
        ],
      });

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json', '--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({ passed: true });
    });

    it('reports an empty manifest as a passing run with no kits', async ({ temp }) => {
      temp.writeJson('manifest.json', { version: 1, kits: [] });

      const { exitCode, stdout } = await verify(['--manifest', 'manifest.json', '--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toStrictEqual({ schemaVersion: 1, passed: true, kits: [] });
    });
  });
});

// region | Helpers

const SHARED_MODULE = Buffer.from('export const shared = 1;\n');
const PACKAGE_JSON = { name: 'demo', version: '3.1.0' };

/** Runs the command over the given arguments, returning its exit code alongside everything it wrote. */
async function verify(args: string[]) {
  using io = captureStdio();

  const exitCode = await verifyCommand(args);

  return { exitCode, stdout: io.stdout, stdoutChunks: io.stdoutChunks, stderr: io.stderr };
}

/**
 * Writes a matching source/output pair and a manifest recording both hashes.
 *
 * Editing that source is the whole scenario: a kit whose TypeScript moved on while the compiled
 * bundle from which it was built stayed put.
 */
function writeCompiledPair(tree: TempTree): void {
  const compiled = Buffer.from('export default { checklists: [] };\n');
  const source = Buffer.from('export default defineRdyKit({ checklists: [] });\n');
  tree.write('demo.js', compiled);
  tree.write('demo.ts', source);
  tree.writeJson('manifest.json', {
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
  });
}

/** Writes a manifest naming one matching kit, one drifted kit, and one with no recorded hash. */
function writeMixedManifest(tree: TempTree): void {
  const clean = Buffer.from('export default { checks: [] };\n');
  tree.write('clean.js', clean);
  tree.write('edited.js', 'export default { edited: true };\n');
  tree.writeJson('manifest.json', {
    version: 1,
    kits: [
      { name: 'clean', path: 'clean.js', targetHash: hashBytes(clean) },
      { name: 'edited', path: 'edited.js', targetHash: 'deadbeef' },
      { name: 'gone', path: 'gone.js', targetHash: 'abcd1234' },
      { name: 'unhashed', path: 'clean.js' },
    ],
  });
}

/**
 * Writes a kit whose compile read a sibling module and a version out of `package.json`, and a
 * manifest recording all of it.
 *
 * The two hash verdicts are arranged to pass, so whatever the run reports comes from the closure.
 */
function writeRecordedClosure(tree: TempTree): void {
  const compiled = Buffer.from('export default { checklists: [] };\n');
  const source = Buffer.from('export default defineRdyKit({ checklists: [] });\n');
  tree.write('demo.js', compiled);
  tree.write('demo.ts', source);
  tree.write('shared.ts', SHARED_MODULE);
  tree.writeJson('package.json', PACKAGE_JSON);
  tree.writeJson('manifest.json', {
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
  });
}

// endregion | Helpers
