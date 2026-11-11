import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { kitLoadError } from '../../errors/RdyError.ts';
import type { RaisedWarning } from '../../schemas/common.ts';
import { createUncachedRemoteContext } from '../../test-utils/createUncachedRemoteContext.ts';
import type { UnrunSource } from '../KitSelection.ts';
import type { ResolvedKitEntry } from '../ResolvedKitEntry.ts';
import { runHumanMode } from '../runHumanMode.ts';
import { createRunFakes, type RunFakes } from '../test-utils/createRunFakes.ts';
import { buildSingleKitEntry, makeKit } from '../test-utils/kit-fixtures.ts';
import { runHuman } from '../test-utils/runHuman.ts';

/** A warning as the unmarked-generated report returns it. */
const GENERATED_UNMARKED: RaisedWarning = {
  code: 'generated-unmarked',
  message:
    'dist/app.mjs looks like bundler output (its mean line length exceeds 250 characters) and is not marked as generated.',
  remedy: 'Add `/dist/app.mjs linguist-generated=true` to .gitattributes, so that kits stop sweeping it.',
};

/** A staleness warning as the staleness report returns it for the `default` kit. */
const TARGET_DRIFT_DEFAULT: RaisedWarning = {
  code: 'target-drift',
  message: 'compiled kit "default" does not match the hash that the manifest recorded for it.',
  remedy: 'Move the edits into the source, then run `rdy compile --force`.',
};

/** A warning as the unused-pragma report returns it. */
const PRAGMA_UNUSED: RaisedWarning = { code: 'pragma-unused', message: 'pragma unused.', remedy: 'Remove it.' };

describe(runHumanMode, () => {
  let fakes: RunFakes;

  beforeEach(() => {
    fakes = createRunFakes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('unused-pragma advisories', () => {
    /** Builds two entries whose names and compiled paths differ, so that a per-kit ledger would show as two. */
    function buildTwoKitEntries() {
      return [
        { name: 'alpha', source: { path: '.readyup/kits/alpha.js' }, checklists: ['deploy'] },
        { name: 'beta', source: { path: '.readyup/kits/beta.js' }, checklists: ['deploy'] },
      ];
    }

    it('reports after the summary table, the last block in which a pragma’s file may be named', async () => {
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: undefined });
      fakes.runRdy.mockResolvedValue({ results: [], passed: true, durationMs: 0 });

      fakes.listUnusedPragmaWarnings.mockReturnValue([PRAGMA_UNUSED]);

      const writes = await runHumanRecordingWrites(buildTwoKitEntries(), fakes, []);

      const summaryIndex = writes.findIndex(({ text }) => text === 'combined summary\n');
      const warningIndex = writes.findIndex(({ text }) => text.startsWith(`Warning: ${PRAGMA_UNUSED.message}`));
      expect(summaryIndex).toBeGreaterThan(-1);
      expect(warningIndex).toBeGreaterThan(summaryIndex);
    });
  });

  describe('warning output', () => {
    const MANIFEST_UNREADABLE: RaisedWarning = {
      code: 'manifest-unreadable',
      message: 'manifest unreadable.',
      remedy: 'Rewrite it.',
    };

    it('writes each warning on stderr where its producer runs, around the stdout blocks', async () => {
      fakes.readManifestTracking.mockReturnValue({ tracking: undefined, warnings: [MANIFEST_UNREADABLE] });
      fakes.listKitStalenessWarnings.mockReturnValue([TARGET_DRIFT_DEFAULT]);
      fakes.listUnusedPragmaWarnings.mockReturnValue([PRAGMA_UNUSED]);
      fakes.listUnmarkedGeneratedSourceWarnings.mockResolvedValue([GENERATED_UNMARKED]);
      fakes.loadKit.mockResolvedValue({ kit: makeKit(), compileTimeVersion: '999.0.0' });
      fakes.runRdy.mockResolvedValue({
        results: [],
        passed: true,
        durationMs: 0,
        diagnoses: [{ name: 'a', verdict: 'masked-pass' }],
      });

      const writes = await runHumanRecordingWrites(buildSingleKitEntry(['deploy']), fakes, [
        { spelling: 'npm:a', requestedNames: ['default'], publishedNames: ['x'] },
      ]);

      // Collapse each stdout block to a marker, since only its position relative to the warnings is under test.
      const sequence = writes
        .filter(({ text }) => text !== '\n')
        .map(({ stream, text }) => (stream === 'stdout' ? 'stdout' : text));
      expect(sequence).toStrictEqual([
        `Warning: ${MANIFEST_UNREADABLE.message} ${MANIFEST_UNREADABLE.remedy}\n`,
        `Warning: ${TARGET_DRIFT_DEFAULT.message} ${TARGET_DRIFT_DEFAULT.remedy}\n`,
        expect.stringMatching(/^Warning: kit "default" was compiled by readyup 999\.0\.0, ahead of/),
        'stdout',
        expect.stringMatching(/^Warning: skipped check "a" in kit "default" \/ checklist "deploy" would have passed\./),
        `Warning: ${PRAGMA_UNUSED.message} ${PRAGMA_UNUSED.remedy}\n`,
        `Warning: ${GENERATED_UNMARKED.message} ${GENERATED_UNMARKED.remedy}\n`,
        expect.stringMatching(/^Warning: configured source "npm:a" publishes no kit named "default"/),
        'stdout',
      ]);
    });
  });

  describe('raised hints', () => {
    const GITHUB_URL = 'https://raw.githubusercontent.com/acme/private/main/.readyup/kits/deploy.js';
    const GITHUB_HINT = 'If the repository is private, set GITHUB_TOKEN or run `gh auth login`.';

    it('puts the hint on a line of its own, below the error', async () => {
      fakes.loadKit.mockRejectedValue(
        kitLoadError(`Failed to fetch remote kit from ${GITHUB_URL}`, { hint: GITHUB_HINT }),
      );

      const { stderr } = await runHuman([{ name: 'deploy', source: { url: GITHUB_URL }, checklists: [] }], {}, fakes);

      expect(stderr).toBe(`rdy: Failed to fetch remote kit from ${GITHUB_URL}\n\u{1F449} Hint: ${GITHUB_HINT}\n`);
    });
  });
});

// region | Helpers

/** One write to stdout or stderr, in the order in which the run made it. */
interface RecordedWrite {
  stream: 'stderr' | 'stdout';
  text: string;
}

/** Runs the mode over the given entries and returns every write to stdout and stderr, in one ordered list. */
async function runHumanRecordingWrites(
  kitEntries: ResolvedKitEntry[],
  fakes: RunFakes,
  unrunSources: UnrunSource[],
): Promise<RecordedWrite[]> {
  const writes: RecordedWrite[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    writes.push({ stream: 'stdout', text: String(chunk) });
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    writes.push({ stream: 'stderr', text: String(chunk) });
    return true;
  });

  const remote = createUncachedRemoteContext();
  await runHumanMode(
    kitEntries,
    { shouldDiagnose: false, failOn: undefined, quiet: false, remote, reportOn: undefined, unrunSources },
    false,
    fakes,
  );

  return writes;
}

// endregion | Helpers
