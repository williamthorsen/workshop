import path from 'node:path';

import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture, silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt, vi } from 'vitest';

import { loadRdyKit } from '../../kits/loadRdyKit.ts';
import type { RdyResult } from '../../kits/types.ts';
import { runRdy } from '../../run/runRdy.ts';
import { initCommand } from '../initCommand.ts';

const KIT_PATH = '.readyup/kits/default.ts';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../../..');

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => {
    const tree = createTempTree({}, { prefix: 'rdy-init-scaffold-' });
    // The scaffolded kit imports `readyup` by name, and jiti resolves that by walking up from the kit
    // file. The link is what the walk finds, standing in for the install that a real project would have.
    tree.symlink('node_modules/readyup', PACKAGE_ROOT);

    return tree;
  }),
);

it.aroundEach(async (runTest, { temp }) => {
  // `scaffoldConfig` writes relative paths, which resolve against the real process directory.
  using _cwd = pointCwdAt(temp.dir, { chdir: true });

  await runTest();
});

/**
 * Covers the kit that `rdy init` writes by running it, rather than comparing it to the template from which it came.
 *
 * The template is a string, so no typecheck or lint reaches it. Loading it through the same path that
 * `rdy run --jit` takes proves that a scaffolded project works before its author has written anything.
 */
describe('scaffolded kit', () => {
  it('passes with NODE_ENV set, reporting the value that it found', async () => {
    using _silent = silenceConsole(['error', 'info']);

    vi.stubEnv('NODE_ENV', 'production');
    initCommand({ dryRun: false, force: false });

    const results = await runScaffoldedKit();

    expect(results).toMatchObject([{ name: 'NODE_ENV is set', status: 'passed', detail: 'NODE_ENV is production' }]);
  });

  it('fails with NODE_ENV unset, reporting that the environment has no value', async () => {
    using _silent = silenceConsole(['error', 'info']);

    vi.stubEnv('NODE_ENV', undefined);
    initCommand({ dryRun: false, force: false });

    const results = await runScaffoldedKit();

    expect(results).toMatchObject([
      {
        name: 'NODE_ENV is set',
        status: 'failed',
        detail: 'NODE_ENV has no value in the environment',
        fix: 'Set NODE_ENV before deploying',
      },
    ]);
  });
});

// region | Helpers

/** Loads the scaffolded kit from source and runs the one checklist that it declares. */
async function runScaffoldedKit(): Promise<RdyResult[]> {
  const { kit } = await loadRdyKit(KIT_PATH);
  const [checklist] = kit.checklists;
  if (checklist === undefined) throw new Error('The scaffolded kit declares no checklist');

  const report = await runRdy(checklist);
  return report.results;
}

// endregion | Helpers
