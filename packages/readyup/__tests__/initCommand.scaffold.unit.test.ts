import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadRdyKit } from '../src/config.ts';
import { initCommand } from '../src/init/initCommand.ts';
import { runRdy } from '../src/runRdy.ts';
import type { RdyResult } from '../src/types.ts';

const TEST_DIR = join(import.meta.dirname, '../.test-tmp-scaffold');
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
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(TEST_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('passes with NODE_ENV set, reporting the value it found', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    initCommand({ dryRun: false, force: false });

    const results = await runScaffoldedKit();

    expect(results).toMatchObject([{ name: 'NODE_ENV is set', status: 'passed', detail: 'production' }]);
  });

  it('fails with NODE_ENV unset, reporting that the environment carries no value', async () => {
    vi.stubEnv('NODE_ENV', undefined);
    initCommand({ dryRun: false, force: false });

    const results = await runScaffoldedKit();

    expect(results).toMatchObject([
      {
        name: 'NODE_ENV is set',
        status: 'failed',
        detail: 'no value in the environment',
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
