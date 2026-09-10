import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureStdio, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { routeCommand } from '../route.ts';

/** A kit whose single check passes. */
const PASSING_KIT = `export default { checklists: [{ name: 'main', checks: [{ name: 'ok', check: () => true }] }] };\n`;

/** A kit whose single error-severity check fails. */
const FAILING_KIT = `export default { checklists: [{ name: 'main', checks: [{ name: 'nope', check: () => false }] }] };\n`;

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  { scope: 'file' },
  makeFixture(() =>
    createTempTree(
      { '.readyup/kits/failing.js': FAILING_KIT, '.readyup/kits/passing.js': PASSING_KIT },
      { prefix: 'readyup-partial-results-' },
    ),
  ),
);

it.aroundAll(async (runSuite, { temp }) => {
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runSuite();
});

describe('partial results when a kit fails after dispatch', () => {
  describe('JSON mode', () => {
    it('keeps results from the kits on either side of a failed kit', async () => {
      const { exitCode, stdout } = await route(['passing', 'absent', 'failing', '--json']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(stdout)).toMatchObject({
        kits: [
          { name: 'passing', passed: true, counts: { passed: 1, errors: 0 } },
          { name: 'absent', error: { code: 'kit-load', message: expect.any(String) } },
          { name: 'failing', passed: false, counts: { passed: 0, errors: 1 } },
        ],
      });
    });

    it('aggregates top-level counts over only the kits that ran', async () => {
      const { stdout } = await route(['passing', 'absent', '--json']);

      expect(JSON.parse(stdout)).toMatchObject({
        counts: { passed: 1, errors: 0, warnings: 0, recommendations: 0, blocked: 0, optional: 0 },
      });
      expect(JSON.parse(stdout)).not.toHaveProperty('worstSeverity');
    });

    it('reports the run as failed when a kit never ran, even though what ran passed', async () => {
      const { stdout } = await route(['passing', 'absent', '--json']);

      expect(JSON.parse(stdout)).toMatchObject({ passed: false });
    });

    it('emits a report rather than an envelope when the only kit fails', async () => {
      const { exitCode, stdout } = await route(['absent', '--json']);

      expect(exitCode).toBe(2);
      expect(JSON.parse(stdout)).toMatchObject({
        kits: [{ name: 'absent', error: { code: 'kit-load', message: expect.any(String) } }],
      });
    });

    it('exits 2 rather than 1 when a kit fails alongside failing checks', async () => {
      const { exitCode } = await route(['failing', 'absent', '--json']);

      expect(exitCode).toBe(2);
    });
  });

  describe('human mode', () => {
    it('reports the failure on stderr and continues to the next kit', async () => {
      const { exitCode, stderr, stdout } = await route(['absent', 'passing']);

      expect(exitCode).toBe(2);
      expect(stderr).toContain('Error [absent]:');
      expect(stdout).toContain('ok');
    });

    it('heads every requested kit on stdout, including one that never ran', async () => {
      const { stdout } = await route(['passing', 'absent', '--style', 'rich']);

      expect(stdout).toContain('\u{2501}\u{2501} \u{1F4D3} passing');
      expect(stdout).toContain('\u{2501}\u{2501} \u{1F4D3} absent');
    });

    it('keeps the failure off stdout, where a failed check would appear', async () => {
      const { stdout } = await route(['passing', 'absent']);

      expect(stdout).not.toContain('Error [absent]:');
    });

    it('drops the kit label when a lone kit leaves nothing to disambiguate', async () => {
      const { stderr } = await route(['absent']);

      expect(stderr).toMatch(/^Error: /);
    });
  });
});

// region | Helpers

/**
 * Runs the CLI over the given arguments, returning its exit code alongside everything it wrote.
 *
 * The terminal is pinned absent so style detection resolves to plain wherever the suite runs. A test asserting
 * rich output names `--style rich`.
 */
async function route(args: string[]) {
  using io = captureStdio({ isTty: false });

  const exitCode = await routeCommand(args);

  return { exitCode, stdout: io.stdout, stderr: io.stderr };
}

// endregion | Helpers
