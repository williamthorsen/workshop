import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { captureStdio, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { ListOutputSchema } from '../../schemas/listOutputSchema.ts';
import { ReportSchema } from '../../schemas/reportSchema.ts';
import { routeCommand } from '../route.ts';

/** A kit whose single check passes. */
const PASSING_KIT = `export default { checklists: [{ name: 'main', checks: [{ name: 'ok', check: () => true }] }] };\n`;

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  { scope: 'file' },
  makeFixture(() =>
    createTempTree(
      {
        '.readyup/kits/alpha.js': PASSING_KIT,
        '.readyup/kits/alpha.ts': PASSING_KIT,
        '.readyup/kits/beta.js': PASSING_KIT,
        '.readyup/manifest.json': JSON.stringify({
          version: 1,
          kits: [
            { name: 'alpha', path: 'kits/alpha.js' },
            { name: 'beta', path: 'kits/beta.js' },
          ],
        }),
        'uncompiled/.readyup/kits/draft.ts': PASSING_KIT,
      },
      { prefix: 'readyup-run-all-' },
    ),
  ),
);

it.aroundAll(async (runSuite, { temp }) => {
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runSuite();
});

describe('rdy --all', () => {
  it('runs every compiled kit of the project once, with no subcommand named', async () => {
    const { exitCode, stdout } = await route(['--all', '--json']);

    expect(exitCode).toBe(0);
    expect(ReportSchema.parse(JSON.parse(stdout)).kits.map((kit) => kit.name)).toStrictEqual(['alpha', 'beta']);
  });

  it('runs the kits that the listing reports as compiled', async () => {
    const listed = ListOutputSchema.parse(JSON.parse((await route(['list', '--json'])).stdout));
    const ran = ReportSchema.parse(JSON.parse((await route(['run', '--all', '--json'])).stdout));

    const compiledNames = listed.kits.filter((kit) => kit.kind === 'compiled').map((kit) => kit.name);
    expect(ran.kits.map((kit) => kit.name)).toStrictEqual(compiledNames);
  });

  it('exits 2 and names the output directory when the project has nothing compiled', async ({ temp }) => {
    using _cwd = pointCwdAt(temp.resolve('uncompiled'), { chdir: true });

    const { exitCode, stderr } = await route(['--all']);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('--all found no compiled kits in .readyup/kits.');
  });
});

// region | Helpers

/** Runs the router over the given arguments, returning its exit code alongside everything it wrote. */
async function route(args: string[]) {
  using io = captureStdio();

  const exitCode = await routeCommand(args);

  return { exitCode, stdout: io.stdout, stderr: io.stderr };
}

// endregion | Helpers
