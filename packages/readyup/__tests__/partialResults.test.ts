import { describe, expect } from 'vitest';

import { routeCommand } from '../src/bin/route.ts';
import { type CapturedStdio, createStdioFixture } from './helpers/capturedStdio.ts';
import { createTempDirTest } from './helpers/tempDir.ts';

/** A kit whose single check passes. */
const PASSING_KIT = `export default { checklists: [{ name: 'main', checks: [{ name: 'ok', check: () => true }] }] };\n`;

/** A kit whose single error-severity check fails. */
const FAILING_KIT = `export default { checklists: [{ name: 'main', checks: [{ name: 'nope', check: () => false }] }] };\n`;

const it = createTempDirTest({
  prefix: 'readyup-partial-results-',
  cwd: 'chdir',
  scope: 'file',
  setup: (temp) => {
    temp.write('.readyup/kits/passing.js', PASSING_KIT);
    temp.write('.readyup/kits/failing.js', FAILING_KIT);
  },
}).extend<{ io: CapturedStdio }>({ io: createStdioFixture() });

describe('partial results when a kit fails after dispatch', () => {
  describe('JSON mode', () => {
    it('keeps results from the kits on either side of a failed kit', async ({ io }) => {
      const exitCode = await routeCommand(['passing', 'absent', 'failing', '--json']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(io.stdout)).toMatchObject({
        kits: [
          { name: 'passing', passed: true, counts: { passed: 1, errors: 0 } },
          { name: 'absent', error: { code: 'kit-load', message: expect.any(String) } },
          { name: 'failing', passed: false, counts: { passed: 0, errors: 1 } },
        ],
      });
    });

    it('aggregates top-level counts over only the kits that ran', async ({ io }) => {
      await routeCommand(['passing', 'absent', '--json']);

      expect(JSON.parse(io.stdout)).toMatchObject({
        counts: { passed: 1, errors: 0, warnings: 0, recommendations: 0, blocked: 0, optional: 0 },
      });
      expect(JSON.parse(io.stdout)).not.toHaveProperty('worstSeverity');
    });

    it('reports the run as failed when a kit never ran, even though what ran passed', async ({ io }) => {
      await routeCommand(['passing', 'absent', '--json']);

      expect(JSON.parse(io.stdout)).toMatchObject({ passed: false });
    });

    it('emits a report rather than an envelope when the only kit fails', async ({ io }) => {
      const exitCode = await routeCommand(['absent', '--json']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(io.stdout)).toMatchObject({
        kits: [{ name: 'absent', error: { code: 'kit-load', message: expect.any(String) } }],
      });
    });

    it('exits 2 rather than 1 when a kit fails alongside failing checks', async () => {
      await expect(routeCommand(['failing', 'absent', '--json'])).resolves.toBe(2);
    });
  });

  describe('human mode', () => {
    it('reports the failure on stderr and continues to the next kit', async ({ io }) => {
      const exitCode = await routeCommand(['absent', 'passing']);

      expect(exitCode).toBe(2);
      expect(io.stderr).toContain('Error [absent]:');
      expect(io.stdout).toContain('ok');
    });

    it('heads every requested kit on stdout, including one that never ran', async ({ io }) => {
      await routeCommand(['passing', 'absent']);

      expect(io.stdout).toContain('\u{2501}\u{2501} passing');
      expect(io.stdout).toContain('\u{2501}\u{2501} absent');
    });

    it('keeps the failure off stdout, where a failed check would appear', async ({ io }) => {
      await routeCommand(['passing', 'absent']);

      expect(io.stdout).not.toContain('Error [absent]:');
    });

    it('drops the kit label when a lone kit leaves nothing to disambiguate', async ({ io }) => {
      await routeCommand(['absent']);

      expect(io.stderr).toMatch(/^Error: /);
    });
  });
});
