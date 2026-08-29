import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computeHash } from '../../../../src/check-utils/hashing.ts';
import type { RdyResult } from '../../../../src/kits/types.ts';
import { readManifest } from '../../../../src/manifest/readManifest.ts';
import { checkDrift } from '../../../../src/verify/checkDrift.ts';
import { pickResult, runChecklist } from '../../test-utils/checklist-results.ts';
import { loadOwnKit } from '../../test-utils/loadOwnKit.ts';
import {
  FIXTURE_KITS_DIR,
  FIXTURE_MANIFEST_PATH,
  SELF_CONTAINED_BUNDLE,
  writeKit,
  writeKitManifest,
} from '../../test-utils/project-fixture.ts';

const EDITED_BUNDLE = `${SELF_CONTAINED_BUNDLE}// edited by hand\n`;

/**
 * Asserts that `rdy verify` and the `freshness` kit reach one verdict on a manifest neither wrote.
 *
 * The two read the same record through different code, and a recorded hash of a length other than the
 * eight characters `rdy compile` writes is where they can disagree. Each case asserts they agree rather
 * than asserting two literal verdicts, so a change to either reader's wording leaves the test meaningful.
 */
describe('recorded-hash readers', () => {
  let projectRoot: string;
  let originalCwd: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'reader-agreement-'));
    originalCwd = process.cwd();
    process.chdir(projectRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it.each([12, 64])('both pass an unchanged bundle recorded with a %i-character hash', async (length) => {
    const targetHash = computeHash(SELF_CONTAINED_BUNDLE).slice(0, length);
    const entry = { ...writeKit(projectRoot, 'default'), targetHash };
    writeKitManifest(projectRoot, [entry]);

    await expect(readsAsFresh(entry)).resolves.toStrictEqual({ kit: true, verify: true });
  });

  it.each([12, 64])('both fail an edited bundle recorded with a %i-character hash', async (length) => {
    const targetHash = computeHash(SELF_CONTAINED_BUNDLE).slice(0, length);
    const entry = { ...writeKit(projectRoot, 'default'), targetHash };
    writeKitManifest(projectRoot, [entry]);
    writeFileSync(path.join(projectRoot, FIXTURE_KITS_DIR, 'default.js'), EDITED_BUNDLE);

    await expect(readsAsFresh(entry)).resolves.toStrictEqual({ kit: false, verify: false });
  });

  // Below the floor the two readers agree through the schema rather than through the comparison:
  // `readManifest` rejects the record before `checkDrift` sees it, and `checkDrift` called directly on
  // a truthful seven-character prefix would return `ok` where the kit reports a malformed record.
  it('both reject a bundle recorded with a hash shorter than the format admits', async () => {
    const targetHash = computeHash(SELF_CONTAINED_BUNDLE).slice(0, 7);
    writeKitManifest(projectRoot, [{ ...writeKit(projectRoot, 'default'), targetHash }]);

    expect(() => readManifest(FIXTURE_MANIFEST_PATH)).toThrow(/lowercase hex digest prefix/);

    const results = await runChecklist(await loadOwnKit('default'), 'freshness');
    expect(pickResult(results, 'Its bundle')).toMatchObject({
      status: 'failed',
      detail: expect.stringContaining(`records ${targetHash}, which is not a hash`),
    });
  });
});

// region | Helpers

/** How each reader judges the recorded bundle: `true` where it finds the kit fresh. */
async function readsAsFresh(entry: { name: string; path: string; targetHash: string }): Promise<Verdicts> {
  const verify = checkDrift(entry, path.dirname(FIXTURE_MANIFEST_PATH)).kind === 'ok';

  const results: RdyResult[] = await runChecklist(await loadOwnKit('default'), 'freshness');
  const kit = pickResult(results, 'Its bundle').status === 'passed';

  return { kit, verify };
}

/** One verdict per reader of the same manifest entry. */
interface Verdicts {
  kit: boolean;
  verify: boolean;
}

// endregion | Helpers
