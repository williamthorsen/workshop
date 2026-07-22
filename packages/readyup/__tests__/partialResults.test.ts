import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { routeCommand } from '../src/bin/route.ts';

/** A kit whose single check passes. */
const PASSING_KIT = `export default { checklists: [{ name: 'main', checks: [{ name: 'ok', check: () => true }] }] };\n`;

/** A kit whose single error-severity check fails. */
const FAILING_KIT = `export default { checklists: [{ name: 'main', checks: [{ name: 'nope', check: () => false }] }] };\n`;

let cwd: string;
let originalCwd: string;
let stdout: string[];
let stderr: string[];
let stdoutSpy: MockInstance;
let stderrSpy: MockInstance;

beforeAll(() => {
  originalCwd = process.cwd();
  cwd = mkdtempSync(path.join(tmpdir(), 'readyup-partial-results-'));
  mkdirSync(path.join(cwd, '.readyup/kits'), { recursive: true });
  writeFileSync(path.join(cwd, '.readyup/kits/passing.js'), PASSING_KIT);
  writeFileSync(path.join(cwd, '.readyup/kits/failing.js'), FAILING_KIT);
  process.chdir(cwd);
});

afterAll(() => {
  process.chdir(originalCwd);
  rmSync(cwd, { recursive: true, force: true });
});

beforeEach(() => {
  stdout = [];
  stderr = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

describe('partial results when a kit fails after dispatch', () => {
  describe('JSON mode', () => {
    it('keeps results from the kits on either side of a failed kit', async () => {
      const exitCode = await routeCommand(['passing', 'absent', 'failing', '--json']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(readStdout())).toMatchObject({
        kits: [
          { name: 'passing', passed: 1, errors: 0 },
          { name: 'absent', error: { code: 'kit-load', message: expect.any(String) } },
          { name: 'failing', passed: 0, errors: 1 },
        ],
      });
    });

    it('aggregates top-level counts over only the kits that ran', async () => {
      await routeCommand(['passing', 'absent', '--json']);

      expect(JSON.parse(readStdout())).toMatchObject({
        passed: 1,
        errors: 0,
        warnings: 0,
        recommendations: 0,
        blocked: 0,
        optional: 0,
        worstSeverity: null,
      });
    });

    it('emits a report rather than an envelope when the only kit fails', async () => {
      const exitCode = await routeCommand(['absent', '--json']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(readStdout())).toMatchObject({
        kits: [{ name: 'absent', error: { code: 'kit-load', message: expect.any(String) } }],
      });
    });

    it('exits 2 rather than 1 when a kit fails alongside failing checks', async () => {
      await expect(routeCommand(['failing', 'absent', '--json'])).resolves.toBe(2);
    });
  });

  describe('human mode', () => {
    it('reports the failure on stderr and continues to the next kit', async () => {
      const exitCode = await routeCommand(['absent', 'passing']);

      expect(exitCode).toBe(2);
      expect(readStderr()).toContain('Error [absent]:');
      expect(readStdout()).toContain('ok');
    });

    it('heads every requested kit on stdout, including one that never ran', async () => {
      await routeCommand(['passing', 'absent']);

      expect(readStdout()).toContain('=== passing ===');
      expect(readStdout()).toContain('=== absent ===');
    });

    it('keeps the failure off stdout, where a failed check would appear', async () => {
      await routeCommand(['passing', 'absent']);

      expect(readStdout()).not.toContain('Error [absent]:');
    });

    it('drops the kit label when a lone kit leaves nothing to disambiguate', async () => {
      await routeCommand(['absent']);

      expect(readStderr()).toMatch(/^Error: /);
    });
  });
});

/** Everything written to stdout during the current test. */
function readStdout(): string {
  return stdout.join('');
}

/** Everything written to stderr during the current test. */
function readStderr(): string {
  return stderr.join('');
}
