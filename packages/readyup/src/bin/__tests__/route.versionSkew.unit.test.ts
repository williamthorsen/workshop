import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureStdio, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { VERSION } from '../../version.ts';
import { routeCommand } from '../route.ts';

/** A stamp no released readyup reaches, so the bundle carrying it is always ahead of the runner. */
const AHEAD_STAMP = '99.0.0';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  { scope: 'file' },
  makeFixture(() =>
    createTempTree(
      {
        '.readyup/kits/ahead.js': buildKit({ stamp: AHEAD_STAMP }),
        '.readyup/kits/behind.js': buildKit({ stamp: '0.19.2' }),
        '.readyup/kits/floored.js': buildKit({ floor: '0.0.1', stamp: AHEAD_STAMP }),
        '.readyup/kits/unstamped.js': buildKit({}),
      },
      { prefix: 'readyup-version-skew-' },
    ),
  ),
);

it.aroundAll(async (runSuite, { temp }) => {
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runSuite();
});

describe('skew between a bundle stamp and the runner', () => {
  it('reports a bundle compiled ahead of the runner, naming both versions', async () => {
    using io = captureStdio();

    await routeCommand(['ahead', '--json']);
    const parsed: unknown = JSON.parse(io.stdout);

    expect(parsed).toHaveProperty('warnings.0.code', 'version-skew');
    expect(parsed).toHaveProperty(
      'warnings.0.message',
      `kit "ahead" was compiled by readyup ${AHEAD_STAMP}, ahead of the ${VERSION} running it.`,
    );
    expect(parsed).toHaveProperty('warnings.0.remedy', expect.stringContaining(AHEAD_STAMP));
  });

  it('leaves the exit code alone', async () => {
    using io = captureStdio();

    const exitCode = await routeCommand(['ahead', '--json']);

    expect(exitCode).toBe(0);
    expect(JSON.parse(io.stdout)).toMatchObject({ kits: [{ name: 'ahead', passed: true }] });
  });

  it.each([['behind'], ['unstamped']])('reports nothing for the %s bundle', async (kitName) => {
    using io = captureStdio();

    await routeCommand([kitName, '--json']);
    const parsed: unknown = JSON.parse(io.stdout);

    expect(parsed).not.toHaveProperty('warnings');
  });

  // The floor is the author's own statement of what the kit needs, so the stamp adds nothing.
  it('reports nothing for a kit that declares a floor', async () => {
    using io = captureStdio();

    await routeCommand(['floored', '--json']);
    const parsed: unknown = JSON.parse(io.stdout);

    expect(parsed).not.toHaveProperty('warnings');
  });

  it('writes the advisory to stderr in human mode', async () => {
    using io = captureStdio();

    const exitCode = await routeCommand(['ahead']);

    expect(exitCode).toBe(0);
    expect(io.stderr).toContain(`was compiled by readyup ${AHEAD_STAMP}, ahead of the ${VERSION} running it.`);
  });
});

// region | Helpers

/** Builds a kit source whose single check passes, optionally stamped and optionally declaring a floor. */
function buildKit({ floor, stamp }: { floor?: string; stamp?: string }): string {
  const banner = stamp === undefined ? '' : `export const __readyupVersion = '${stamp}';\n`;
  const declaredFloor = floor === undefined ? '' : `minReadyupVersion: '${floor}', `;
  return `${banner}export default { ${declaredFloor}checklists: [{ name: 'main', checks: [{ name: 'ok', check: () => true }] }] };\n`;
}

// endregion | Helpers
