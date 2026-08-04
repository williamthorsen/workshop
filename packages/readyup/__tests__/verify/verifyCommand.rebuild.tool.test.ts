import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { compileConfig } from '../../src/compile/compileConfig.ts';
import type { JsonVerifyOutput } from '../../src/schemas/index.ts';
import { hashFile } from '../../src/verify/targetHash.ts';
import { verifyCommand } from '../../src/verify/verifyCommand.ts';
import { VERSION } from '../../src/version.ts';

/** Absolute specifier for the `pickJson` marker, so a kit written into a tempdir can import it. */
const PICK_JSON_MODULE = path.resolve(import.meta.dirname, '../../src/compile/pickJson.ts');

const KIT_SOURCE = `import { pickJson } from ${JSON.stringify(PICK_JSON_MODULE)};

export const metadata = pickJson('./data.json', ['name', 'version']);

export default { checklists: [] };
`;

/**
 * Exercises `--rebuild` against real esbuild, which is what the check is for: the inputs it catches
 * and the recorded hashes miss are the ones a mocked bundler stands in for.
 */
describe('verifyCommand --rebuild', () => {
  let tempDir: string;
  let stdoutSpy: MockInstance;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'verify-rebuild-'));
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }));
    writeFileSync(path.join(tempDir, 'kit.ts'), KIT_SOURCE);

    // Record the manifest from a real compile, so its hashes are the ones the pipeline produces.
    const result = await compileConfig(path.join(tempDir, 'kit.ts'), path.join(tempDir, 'kit.js'));
    writeFileSync(
      path.join(tempDir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        kits: [
          {
            name: 'demo',
            path: 'kit.js',
            readyupVersion: VERSION,
            source: 'kit.ts',
            sourceHash: hashFile(path.join(tempDir, 'kit.ts')),
            targetHash: result.targetHash,
          },
        ],
      }),
    );

    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('passes an untouched tree', async () => {
    const exitCode = await runVerify();

    expect(exitCode).toBe(0);
    expect(readPayload(stdoutSpy)).toMatchObject({
      passed: true,
      kits: [{ name: 'demo', status: 'ok', sourceStatus: 'ok', rebuildStatus: 'ok' }],
    });
  });

  it('fails a bundle stale only in an inlined JSON file, which both recorded hashes still pass', async () => {
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '2.0.0' }));

    const exitCode = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdoutSpy)).toMatchObject({
      passed: false,
      // The `.ts` and the `.js` are both untouched, so the hash verdicts see nothing wrong. Only the
      // rebuild reads the JSON the bundle inlined, which is the gap the flag exists to close.
      kits: [{ status: 'ok', sourceStatus: 'ok', rebuildStatus: 'mismatch' }],
    });
  });

  it('inlines the edited value into the recompiled bundle rather than the committed one', async () => {
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '2.0.0' }));

    await runVerify();

    expect(readFileSync(path.join(tempDir, 'kit.js'), 'utf8')).toContain('1.0.0');
  });

  it('fails a hand-edited bundle', async () => {
    writeFileSync(path.join(tempDir, 'kit.js'), 'export default { checklists: [] };\n');

    const exitCode = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdoutSpy)).toMatchObject({
      kits: [{ status: 'drift', rebuildStatus: 'mismatch' }],
    });
  });

  it('reports a passing rebuild beside a recorded hash that has gone wrong', async () => {
    const manifestPath = path.join(tempDir, 'manifest.json');
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
    writeFileSync(manifestPath, JSON.stringify(overrideTargetHash(manifest, 'deadbeef')));

    const exitCode = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdoutSpy)).toMatchObject({
      kits: [{ status: 'drift', rebuildStatus: 'ok' }],
    });
  });

  it('fails a kit whose source no longer compiles', async () => {
    writeFileSync(path.join(tempDir, 'kit.ts'), 'export default { checklists: [ ;\n');

    const exitCode = await runVerify();

    expect(exitCode).toBe(1);
    expect(readPayload(stdoutSpy)).toMatchObject({
      kits: [{ rebuildStatus: 'failed' }],
    });
  });

  it('leaves every rebuild field out of the payload without the flag', async () => {
    writeFileSync(path.join(tempDir, 'data.json'), JSON.stringify({ name: 'demo', version: '2.0.0' }));

    const exitCode = await verifyCommand(['--manifest', 'manifest.json', '--json']);

    expect(exitCode).toBe(0);
    expect(readPayload(stdoutSpy).kits[0]).not.toHaveProperty('rebuildStatus');
  });
});

/** Runs `verify` over the tempdir's manifest with the rebuild check and JSON output on. */
async function runVerify(): Promise<number> {
  return verifyCommand(['--manifest', 'manifest.json', '--rebuild', '--json']);
}

/** Reads the single JSON document the run wrote to stdout. */
function readPayload(stdoutSpy: MockInstance): JsonVerifyOutput {
  return JSON.parse(String(stdoutSpy.mock.calls.at(-1)?.[0])) as JsonVerifyOutput;
}

/** Returns the manifest with its one kit's `targetHash` replaced, standing in for a record gone wrong. */
function overrideTargetHash(manifest: unknown, targetHash: string): unknown {
  const { kits, ...rest } = manifest as { kits: Array<Record<string, unknown>> };
  return { ...rest, kits: kits.map((kit) => ({ ...kit, targetHash })) };
}
