import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadRdyKit } from '../../kits/loadRdyKit.ts';
import type { RdyResult } from '../../kits/types.ts';
import { runRdy } from '../../run/runRdy.ts';
import { initCommand } from '../initCommand.ts';

const TEST_DIR = join(import.meta.dirname, '../../../.test-tmp-scaffold');
const KIT_PATH = '.readyup/kits/default.ts';

/**
 * Covers the kit `rdy init` writes by running it, rather than comparing it to the template it came from.
 *
 * The template is a string, so no typecheck or lint reaches it. Loading it through the same path
 * `rdy run --jit` takes is what proves a scaffolded project works before its author has written anything.
 */
describe('scaffolded kit', () => {
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    mkdirSync(TEST_DIR, { recursive: true });
    process.chdir(TEST_DIR);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('passes with NODE_ENV set, reporting the value it found', async () => {
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

/** Loads the scaffolded kit from source and runs the one checklist it declares. */
async function runScaffoldedKit(): Promise<RdyResult[]> {
  const { kit } = await loadRdyKit(KIT_PATH);
  const [checklist] = kit.checklists;
  if (checklist === undefined) throw new Error('The scaffolded kit declares no checklist');

  const report = await runRdy(checklist);
  return report.results;
}
