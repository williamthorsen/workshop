import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureStdio, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { VERSION } from '../../version.ts';
import { routeCommand } from '../route.ts';

/** A floor no released readyup meets, so the kit declaring it always fails. */
const UNREACHABLE_FLOOR = '99.0.0';

/** A floor every readyup meets, so the kit declaring it always runs. */
const MET_FLOOR = '0.0.1';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  { scope: 'file' },
  makeFixture(() =>
    createTempTree(
      {
        '.readyup/kits/met.js': buildKit(MET_FLOOR),
        '.readyup/kits/passing.js': buildKit(),
        '.readyup/kits/source.ts': buildKit(UNREACHABLE_FLOOR),
        '.readyup/kits/unreachable.js': buildKit(UNREACHABLE_FLOOR),
      },
      { prefix: 'readyup-version-floor-' },
    ),
  ),
);

it.aroundAll(async (runSuite, { temp }) => {
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runSuite();
});

describe('a kit-declared readyup floor', () => {
  it('fails a kit whose floor the runner does not meet, naming both versions', async () => {
    using io = captureStdio();

    const exitCode = await routeCommand(['unreachable', '--json']);
    const parsed: unknown = JSON.parse(io.stdout);

    expect(exitCode).toBe(2);
    expect(parsed).toHaveProperty('kits.0.error.code', 'kit-load');
    expect(parsed).toHaveProperty(
      'kits.0.error.message',
      `kit "unreachable" requires readyup ${UNREACHABLE_FLOOR} or later, but this runner is ${VERSION}.`,
    );
  });

  // The load path rewraps anything thrown inside it through `describeError`, which drops the hint.
  it('keeps the hint naming the upgrade', async () => {
    using io = captureStdio();

    await routeCommand(['unreachable', '--json']);
    const parsed: unknown = JSON.parse(io.stdout);

    expect(parsed).toHaveProperty('kits.0.error.hint', expect.stringContaining(UNREACHABLE_FLOOR));
  });

  it('runs a kit whose floor the runner meets', async () => {
    using io = captureStdio();

    const exitCode = await routeCommand(['met', '--json']);

    expect(exitCode).toBe(0);
    expect(JSON.parse(io.stdout)).toMatchObject({ kits: [{ name: 'met', passed: true }] });
  });

  it('leaves the other kits in the run to execute', async () => {
    using io = captureStdio();

    const exitCode = await routeCommand(['passing', 'unreachable', 'met', '--json']);

    expect(exitCode).toBe(2);
    expect(JSON.parse(io.stdout)).toMatchObject({
      kits: [
        { name: 'passing', passed: true },
        { name: 'unreachable', error: { code: 'kit-load' } },
        { name: 'met', passed: true },
      ],
    });
  });

  // The floor is measured against the running readyup, which a source run knows just as a bundle does.
  it('holds for a kit run from TypeScript source under --jit', async () => {
    using io = captureStdio();

    const exitCode = await routeCommand(['source', '--jit', '--json']);
    const parsed: unknown = JSON.parse(io.stdout);

    expect(exitCode).toBe(2);
    expect(parsed).toHaveProperty('kits.0.error.code', 'kit-load');
    expect(parsed).toHaveProperty('kits.0.error.message', expect.stringContaining(`readyup ${UNREACHABLE_FLOOR}`));
  });

  it('reports the failure on stderr in human mode', async () => {
    using io = captureStdio();

    const exitCode = await routeCommand(['unreachable']);

    expect(exitCode).toBe(2);
    expect(io.stderr).toContain(`requires readyup ${UNREACHABLE_FLOOR} or later`);
  });
});

// region | Helpers

/** Builds a kit source whose single check passes, optionally declaring a readyup floor. */
function buildKit(minReadyupVersion?: string): string {
  const floor = minReadyupVersion === undefined ? '' : `minReadyupVersion: '${minReadyupVersion}', `;
  return `export default { ${floor}checklists: [{ name: 'main', checks: [{ name: 'ok', check: () => true }] }] };\n`;
}

// endregion | Helpers
