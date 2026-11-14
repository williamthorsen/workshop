import { describe, expect, it } from 'vitest';

import { ThorChromeRefusal, USAGE_CODE } from '../invocation.ts';
import { renderOutcomeText, renderRefusalText, renderResultText, type TextContext } from '../render-text.ts';
import type { DeleteResult } from '../results.ts';
import { makeProfileEntry } from '../test-utils/profile-entry.ts';

const CONTEXT: TextContext = { env: {}, isStdoutTerminal: false, programName: 'thor-chrome' };

describe(renderOutcomeText, () => {
  it('reports a quit, an idle quit, and a profile that was not running', () => {
    const running = makeProfileEntry({ pid: '11' });
    expect(readLines(renderOutcomeText({ entry: running, isIdle: false, type: 'quit' }, CONTEXT))).toStrictEqual([
      "stdout: Quit profile 'thrive' (PID 11).",
    ]);
    expect(readLines(renderOutcomeText({ entry: running, isIdle: true, type: 'quit' }, CONTEXT))).toStrictEqual([
      "stdout: Quit idle profile 'thrive' (PID 11).",
    ]);
    expect(
      readLines(renderOutcomeText({ entry: makeProfileEntry(), isIdle: false, type: 'quit' }, CONTEXT)),
    ).toStrictEqual(["stdout: Profile 'thrive' is not running."]);
  });

  it('reports a deletion, naming the quit and the dry run', () => {
    const lines = [
      renderOutcomeText({ entry: makeProfileEntry({ pid: '11' }), isDryRun: false, type: 'deleted' }, CONTEXT),
      renderOutcomeText({ entry: makeProfileEntry(), isDryRun: false, type: 'deleted' }, CONTEXT),
      renderOutcomeText({ entry: makeProfileEntry({ pid: '11' }), isDryRun: true, type: 'deleted' }, CONTEXT),
      renderOutcomeText({ entry: makeProfileEntry(), isDryRun: true, type: 'deleted' }, CONTEXT),
    ].flatMap((outcome) => readLines(outcome));
    expect(lines).toStrictEqual([
      "stdout: Quit and deleted profile 'thrive' (PID 11, /p/thrive).",
      "stdout: Deleted profile 'thrive' (/p/thrive).",
      "stdout: Would quit and delete profile 'thrive' (PID 11, /p/thrive).",
      "stdout: Would delete profile 'thrive' (/p/thrive).",
    ]);
  });

  it('reports a retained profile on stdout and a refused one with its hints on stderr', () => {
    const entry = makeProfileEntry({ pid: '11' });
    expect(readLines(renderOutcomeText({ entry, type: 'retained' }, CONTEXT))).toStrictEqual([
      "stdout: Retained profile 'thrive': running (PID 11).",
    ]);
    const error = { code: 'profile-running', message: 'running' };
    expect(readLines(renderOutcomeText({ entry, error, hints: ['Quit it'], type: 'refused' }, CONTEXT))).toStrictEqual([
      'stderr: thor-chrome: running',
      'stderr:   Quit it',
    ]);
  });
});

describe(renderResultText, () => {
  it('summarizes a sweep, naming what it retained and failed to quit', () => {
    const entry = makeProfileEntry();
    const result = makeDeleteResult({
      outcomes: [
        { entry, isDryRun: false, type: 'deleted' },
        { entry, type: 'retained' },
        { entry, error: { code: 'quit-failed', message: 'x' }, hints: [], type: 'refused' },
      ],
    });
    expect(readLines(renderResultText(result, CONTEXT))).toStrictEqual([
      'stdout: Deleted 1 profile, retaining 1 profile, failing to quit 1 profile.',
    ]);
    expect(readLines(renderResultText({ ...result, isDryRun: true, outcomes: [] }, CONTEXT))).toStrictEqual([
      'stdout: No profiles in /p.',
    ]);
    expect(readLines(renderResultText({ ...result, outcomes: [], selection: 'stale' }, CONTEXT))).toStrictEqual([
      'stdout: No stale profiles.',
    ]);
  });

  it('adds nothing after the outcomes of a delete by name, and names an absent derived profile', () => {
    expect(renderResultText(makeDeleteResult({ selection: 'profile' }), CONTEXT)).toStrictEqual([]);
    const result = makeDeleteResult({ missingDerivedDir: '/p/widget-321', selection: 'derived' });
    expect(readLines(renderResultText(result, CONTEXT))).toStrictEqual([
      'stdout: No profile derived from this worktree (/p/widget-321).',
    ]);
  });

  it('says that no profile is running or idle only when the verb found none', () => {
    const outcomes = [{ entry: makeProfileEntry(), isIdle: false, type: 'quit' as const }];
    expect(readLines(renderResultText({ isAll: true, outcomes: [], type: 'quit' }, CONTEXT))).toStrictEqual([
      'stdout: No running profiles.',
    ]);
    expect(renderResultText({ isAll: false, outcomes: [], type: 'quit' }, CONTEXT)).toStrictEqual([]);
    expect(renderResultText({ isAll: true, outcomes, type: 'quit' }, CONTEXT)).toStrictEqual([]);
    expect(readLines(renderResultText({ outcomes: [], type: 'quit-idle' }, CONTEXT))).toStrictEqual([
      'stdout: No idle profiles.',
    ]);
  });

  it('names what made a stale profile stale, and marks an unrecorded one', () => {
    const stale = { origin: 'derived', branch: '9', repoDir: '/w', stale: true };
    const result = {
      entries: [
        makeProfileEntry({ isRepoPresent: true, name: 'present' }, stale),
        makeProfileEntry({ isRepoPresent: false, name: 'gone' }, stale),
        makeProfileEntry({ name: 'bare' }),
      ],
      isStaleOnly: false,
      profilesDir: '/p',
      type: 'list' as const,
    };
    expect(readLines(renderResultText(result, CONTEXT))).toStrictEqual([
      "stdout:   INFO  present: stopped, stale: branch '9' is gone",
      'stdout:   INFO  gone: stopped, stale: repository /w is gone',
      'stdout:   INFO  bare: stopped, unrecorded',
    ]);
  });

  it('warns on stderr after a status or a listing whose state is unknown', () => {
    const entry = makeProfileEntry({ state: 'unknown' });
    expect(
      readLines(renderResultText({ endpoint: 'http://127.0.0.1:1', entry, type: 'status' }, CONTEXT)),
    ).toStrictEqual([
      'stdout: thrive: unknown, endpoint http://127.0.0.1:1',
      'stderr: thor-chrome: could not read the process list, so the reported state is unknown rather than stopped',
      'stderr:   Run thor-chrome status from a terminal outside the sandbox.',
    ]);
  });
});

describe(renderRefusalText, () => {
  it('names --help after a usage refusal and indents the hints of any other', () => {
    const usage = new ThorChromeRefusal(USAGE_CODE, 'unknown command', undefined, { hints: ['ignored'] });
    expect(readLines(renderRefusalText(usage, 'thor-chrome'))).toStrictEqual([
      'stderr: thor-chrome: unknown command',
      "stderr: Try 'thor-chrome --help'.",
    ]);
    const other = new ThorChromeRefusal('profile-missing', 'missing', undefined, { hints: ['List them'] });
    expect(readLines(renderRefusalText(other, 'thor-chrome'))).toStrictEqual([
      'stderr: thor-chrome: missing',
      'stderr:   List them',
    ]);
  });
});

// region | Helpers

/** Builds a delete by `--all` that found nothing, with the given fields replacing the defaults. */
function makeDeleteResult(overrides: Partial<DeleteResult> = {}): DeleteResult {
  return {
    isDryRun: false,
    missingDerivedDir: undefined,
    outcomes: [],
    profilesDir: '/p',
    selection: 'all',
    type: 'delete',
    ...overrides,
  };
}

/** Returns each line prefixed by its stream, so that one assertion covers both. */
function readLines(lines: ReadonlyArray<{ line: string; stream: string }>): string[] {
  return lines.map(({ line, stream }) => `${stream}: ${line}`);
}

// endregion | Helpers
