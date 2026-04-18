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
  let stdoutSpy: MockInstance;
  let stderrSpy: MockInstance;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'verify-integ-'));
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
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
});
