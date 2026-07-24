import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { hashBytes } from '../../src/verify/targetHash.ts';
import { verifyCommand } from '../../src/verify/verifyCommand.ts';

/**
 * Integration test: exercises the full `verifyCommand → checkDrift → hashFile → filesystem` chain
 * against real files in a tempdir, without mocking the drift helper. Unit tests cover the branches;
 * this locks in the wiring (e.g., that `manifestDir` is threaded through correctly).
 */
describe('verifyCommand (integration)', () => {
  let tempDir: string;
  let stdout: string[];
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'verify-integ-'));
    stdout = [];
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns 0 and reports ok when on-disk compiled kit matches manifest targetHash', () => {
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

    const exitCode = verifyCommand(['--manifest', 'manifest.json']);

    expect(exitCode).toBe(0);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('✅ demo — ok'));
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('returns 1 and reports drift when on-disk compiled kit differs from manifest targetHash', () => {
    writeFileSync(path.join(tempDir, 'demo.js'), 'export default { edited: true };\n');
    const manifestPath = path.join(tempDir, 'manifest.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        kits: [{ name: 'demo', path: 'demo.js', source: 'demo.ts', targetHash: 'deadbeef' }],
      }),
    );

    const exitCode = verifyCommand(['--manifest', 'manifest.json']);

    expect(exitCode).toBe(1);
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('⚠️  demo — drift'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('expected deadbeef'));
  });

  describe('source staleness', () => {
    /**
     * Write a matching source/output pair and a manifest recording both hashes.
     *
     * Returns the source path so a test can edit it, which is the whole scenario: a kit whose
     * TypeScript moved on while the compiled bundle it was built from stayed put.
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

    it('returns 0 when both the source and the compiled kit match the manifest', () => {
      writeCompiledPair();

      const exitCode = verifyCommand(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('✅ demo — ok'));
    });

    it('returns 1 when the source was edited without a recompile', () => {
      const sourcePath = writeCompiledPair();
      writeFileSync(sourcePath, 'export default defineRdyKit({ checklists: [], failOn: "warn" });\n');

      const exitCode = verifyCommand(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(1);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('demo — ok; source stale'));
    });

    it('returns 1 when the recorded source was deleted', () => {
      const sourcePath = writeCompiledPair();
      rmSync(sourcePath);

      const exitCode = verifyCommand(['--manifest', 'manifest.json']);

      expect(exitCode).toBe(1);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('demo — ok; source file missing'));
    });

    it('carries both source hashes in the JSON entry for a stale kit', () => {
      const sourcePath = writeCompiledPair();
      const edited = Buffer.from('export default defineRdyKit({ checklists: [], failOn: "warn" });\n');
      writeFileSync(sourcePath, edited);

      verifyCommand(['--manifest', 'manifest.json', '--json']);

      expect(JSON.parse(stdout.join(''))).toMatchObject({
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

  describe('--json', () => {
    /** Write a manifest naming one matching kit, one drifted kit, and one with no recorded hash. */
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

    it('reports every kit status with the hashes only a drift verdict compared', () => {
      writeMixedManifest();

      const exitCode = verifyCommand(['--manifest', 'manifest.json', '--json']);

      expect(exitCode).toBe(1);
      expect(JSON.parse(stdout.join(''))).toStrictEqual({
        schemaVersion: 1,
        passed: false,
        kits: [
          { name: 'clean', status: 'ok', sourceStatus: 'unverified' },
          {
            name: 'edited',
            status: 'drift',
            expected: 'deadbeef',
            actual: expect.any(String),
            sourceStatus: 'unverified',
          },
          { name: 'gone', status: 'missing', sourceStatus: 'unverified' },
          { name: 'unhashed', status: 'unverified', sourceStatus: 'unverified' },
        ],
      });
    });

    it('emits exactly one JSON document and sends the per-kit prose to stderr', () => {
      writeMixedManifest();

      verifyCommand(['--manifest', 'manifest.json', '--json']);

      expect(stdoutSpy).toHaveBeenCalledTimes(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('clean — ok'));
    });

    it('passes when every kit is ok or unverified', () => {
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

      const exitCode = verifyCommand(['--manifest', 'manifest.json', '--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout.join(''))).toMatchObject({ passed: true });
    });

    it('reports an empty manifest as a passing run with no kits', () => {
      writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify({ version: 1, kits: [] }));

      const exitCode = verifyCommand(['--manifest', 'manifest.json', '--json']);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout.join(''))).toStrictEqual({ schemaVersion: 1, passed: true, kits: [] });
    });
  });
});
