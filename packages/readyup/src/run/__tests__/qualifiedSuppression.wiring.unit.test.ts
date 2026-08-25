import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test } from 'vitest';

import type { KitProvenance } from '../../kits/KitProvenance.ts';
import type { RdyChecklist, RdyResult } from '../../kits/types.ts';
import { runRdy } from '../runRdy.ts';

const PACKAGE: KitProvenance = { kind: 'package', packageName: '@williamthorsen/toolbelt.errors', version: '0.5.0' };

const SOURCE_PATH = 'src/errors.ts';

const it = test.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-qualified-suppression-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe('a pragma reaching the check ids the runner resolved', () => {
  it('suppresses the named check and leaves its sibling standing on the same line', async ({ temp }) => {
    temp.write(SOURCE_PATH, 'error instanceof Error; // rdy-ignore toolbelt.errors/no-instanceof-error\n');

    const report = await runRdy(twoChecksOverOneLine(), { provenance: PACKAGE });

    expect(verdicts(report.results)).toStrictEqual([
      { detail: null, id: 'toolbelt.errors/no-instanceof-error', status: 'passed' },
      { detail: 'src/errors.ts:1', id: 'toolbelt.errors/no-hand-rolled-describe-error', status: 'failed' },
    ]);
  });

  it('suppresses the named check where the pragma writes the fully-qualified form', async ({ temp }) => {
    const pragma = '// rdy-ignore @williamthorsen/toolbelt.errors/no-instanceof-error';
    temp.write(SOURCE_PATH, `error instanceof Error; ${pragma}\n`);

    const report = await runRdy(twoChecksOverOneLine(), { provenance: PACKAGE });

    expect(verdicts(report.results)[0]?.status).toBe('passed');
  });

  it('suppresses neither where the pragma names a check the run does not hold', async ({ temp }) => {
    temp.write(SOURCE_PATH, 'error instanceof Error; // rdy-ignore other.kit/no-instanceof-error\n');

    const report = await runRdy(twoChecksOverOneLine(), { provenance: PACKAGE });

    expect(verdicts(report.results).map((verdict) => verdict.status)).toStrictEqual(['failed', 'failed']);
  });

  it('suppresses both where the pragma names no check', async ({ temp }) => {
    temp.write(SOURCE_PATH, 'error instanceof Error; // rdy-ignore\n');

    const report = await runRdy(twoChecksOverOneLine(), { provenance: PACKAGE });

    expect(verdicts(report.results).map((verdict) => verdict.status)).toStrictEqual(['passed', 'passed']);
  });

  it('suppresses nothing by name where the kit has no publishing package to namespace under', async ({ temp }) => {
    temp.write(SOURCE_PATH, 'error instanceof Error; // rdy-ignore toolbelt.errors/no-instanceof-error\n');

    const report = await runRdy(twoChecksOverOneLine());

    expect(verdicts(report.results).map((verdict) => verdict.id)).toStrictEqual([
      'no-instanceof-error',
      'no-hand-rolled-describe-error',
    ]);
    expect(verdicts(report.results).map((verdict) => verdict.status)).toStrictEqual(['failed', 'failed']);
  });
});

// region | Helpers

/** Returns two checks reporting a finding on the same line, each addressable by an id of its own. */
function twoChecksOverOneLine(): RdyChecklist {
  const findings = [{ line: 1, path: SOURCE_PATH, reported: true }];

  return {
    name: 'adoption',
    checks: [
      { name: 'No source narrows a thrown value by hand', id: 'no-instanceof-error', check: () => ({ findings }) },
      {
        name: 'No source defines its own description helper',
        id: 'no-hand-rolled-describe-error',
        check: () => ({ findings }),
      },
    ],
  };
}

/** Reduces results to what a suppression shows up in. */
function verdicts(results: RdyResult[]): Array<{ detail: string | null; id: string | null; status: string }> {
  return results.map((result) => ({ detail: result.detail, id: result.id, status: result.status }));
}

// endregion | Helpers
