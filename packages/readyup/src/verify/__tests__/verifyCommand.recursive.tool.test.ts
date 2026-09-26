import { captureStdio, createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { compileCommand } from '../../compile/compileCommand.ts';
import { VerifyOutputSchema } from '../../schemas/verifyOutputSchema.ts';
import { verifyCommand } from '../verifyCommand.ts';

const KIT_SOURCE = 'export default { checklists: [] };\n';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() =>
    createTempTree(
      {
        'package.json': JSON.stringify({ name: 'root', version: '1.0.0' }),
        '.readyup/kits/root.ts': KIT_SOURCE,
        'packages/ui/package.json': JSON.stringify({ name: 'ui', version: '1.0.0' }),
        'packages/ui/.readyup/kits/ui.ts': KIT_SOURCE,
      },
      { prefix: 'verify-recursive-rebuild-' },
    ),
  ),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runTest();
});

/** Exercises `--recursive --rebuild` against real esbuild, over projects compiled by a real recursive compile. */
describe('verifyCommand --recursive --rebuild', () => {
  it('reproduces the bundles of every project from its own package root', async () => {
    await expect(compileQuietly()).resolves.toBe(0);

    using io = captureStdio();
    const exitCode = await verifyCommand(['--recursive', '--rebuild', '--json']);

    expect(exitCode).toBe(0);
    expect(VerifyOutputSchema.parse(JSON.parse(io.stdout))).toMatchObject({
      passed: true,
      kits: [
        { name: 'root', project: '.', status: 'ok', rebuildStatus: 'ok' },
        { name: 'ui', project: 'packages/ui', status: 'ok', rebuildStatus: 'ok' },
      ],
      projects: [
        { project: '.', passed: true },
        { project: 'packages/ui', passed: true },
      ],
    });
  });
});

// region | Helpers

/** Compiles every kit project with its output captured, returning the exit code. */
async function compileQuietly(): Promise<number> {
  using _io = captureStdio();

  const exitCode = await compileCommand(['--recursive']);
  return exitCode;
}

// endregion | Helpers
