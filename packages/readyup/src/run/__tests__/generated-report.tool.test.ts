import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { captureStdio, createTempTree, pointCwdAt, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { beforeEach, describe, expect, it as baseIt, vi } from 'vitest';

import { listForeignPaths } from '../../check-utils/project/listForeignPaths.ts';
import { readTrackedSources } from '../../check-utils/project/readTrackedSources.ts';
import { warnOnUnmarkedGeneratedSources } from '../generated-report.ts';
import { createPragmaLedger, type PragmaLedger } from '../PragmaLedger.ts';

/** A minified bundle: few lines, each far longer than hand-written code. */
const MINIFIED = `${'var a=1;'.repeat(200)}\n${'b();'.repeat(100)}\n`;

/** The opening of an unminified esbuild bundle, whose lines are as short as hand-written ones. */
const UNMINIFIED = ['var __defProp = Object.defineProperty;', '', '// src/index.ts', 'export const x = 1;', ''].join(
  '\n',
);

const HAND_WRITTEN = [
  '/** Doubles a number. */',
  'export function double(n: number): number {',
  '  return n * 2;',
  '}',
  '',
].join('\n');

// Separated from a unit suite because the tracked listing, the attribute lookup, and the root prefix are all git's.
// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-generated-report-' })),
);

describe(warnOnUnmarkedGeneratedSources, () => {
  beforeEach(() => {
    // Keeps a developer's system-wide linguist declarations out of the attribute lookup.
    vi.stubEnv('GIT_ATTR_NOSYSTEM', '1');
  });

  it('warns about an unmarked minified bundle, naming the file and the line that marks it', async ({ temp }) => {
    temp.write('dist/app.mjs', MINIFIED);
    initRepository(temp);
    using _cwd = pointCwdAt(temp.dir);

    const { warnings, stderr } = await warn(scanning(['dist/app.mjs']));

    expect(warnings).toStrictEqual([
      {
        code: 'generated-unmarked',
        message:
          'dist/app.mjs looks like bundler output (its mean line length exceeds 250 characters) and is not marked as generated.',
        remedy: 'Add `/dist/app.mjs linguist-generated=true` to .gitattributes, so that kits stop sweeping it.',
      },
    ]);
    expect(stderr).toBe(`Warning: ${warnings[0]?.message} ${warnings[0]?.remedy}\n`);
  });

  it('warns about an unmarked unminified bundle by its header', async ({ temp }) => {
    temp.write('scripts/tool.mjs', UNMINIFIED);
    initRepository(temp);
    using _cwd = pointCwdAt(temp.dir);

    const { warnings } = await warn(scanning(['scripts/tool.mjs']));

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("bundler's runtime helpers");
  });

  it('warns about nothing marked by either attribute, hand-written, unexamined, or untracked', async ({ temp }) => {
    temp.write('.gitattributes', 'generated.mjs linguist-generated=true\nvendored.js linguist-vendored\n');
    temp.write('generated.mjs', MINIFIED);
    temp.write('vendored.js', UNMINIFIED);
    temp.write('hand.ts', HAND_WRITTEN);
    temp.write('unexamined.mjs', MINIFIED);
    initRepository(temp);
    temp.write('untracked.mjs', MINIFIED);
    using _cwd = pointCwdAt(temp.dir);

    const { warnings, stderr } = await warn(scanning(['generated.mjs', 'vendored.js', 'hand.ts', 'untracked.mjs']));

    expect(warnings).toStrictEqual([]);
    expect(stderr).toBe('');
  });

  it("leaves readyup's own compiled kits alone even when a check names one as examined", async ({ temp }) => {
    temp.write('.readyup/kits/default.js', `/** @generated. Do not edit. */\n${HAND_WRITTEN}`);
    initRepository(temp);
    using _cwd = pointCwdAt(temp.dir);

    const { warnings } = await warn(scanning(['.readyup/kits/default.js']));

    expect(warnings).toStrictEqual([]);
  });

  it('suggests a root-relative, anchored line from a run in a subdirectory', async ({ temp }) => {
    temp.write('packages/app/dist/app.js', MINIFIED);
    initRepository(temp);
    using _cwd = pointCwdAt(join(temp.dir, 'packages/app'));

    const { warnings } = await warn(scanning(['dist/app.js']));

    expect(warnings[0]?.message).toMatch(/^dist\/app\.js /);
    expect(warnings[0]?.remedy).toContain('`/packages/app/dist/app.js linguist-generated=true`');
  });

  it('writes a line that git reads as marking exactly that file, for a path needing escapes or quotes', async ({
    temp,
  }) => {
    const paths = ['with space.mjs', 'star*.mjs', 'both [x] *.mjs'];
    for (const filePath of paths) temp.write(filePath, MINIFIED);
    initRepository(temp);
    using _cwd = pointCwdAt(temp.dir);

    const { warnings } = await warn(scanning(paths));
    const lines = warnings.map((warning) => /`(.+)`/.exec(warning.remedy ?? '')?.[1]);

    expect(lines).toStrictEqual([
      String.raw`"/both \\[x] \\*.mjs" linguist-generated=true`,
      String.raw`/star\*.mjs linguist-generated=true`,
      '"/with space.mjs" linguist-generated=true',
    ]);

    // A fresh directory, since the attribute lookup is memoized per `cwd`.
    const marked = join(temp.dir, 'marked');
    for (const filePath of [...paths, 'starX.mjs']) temp.write(join('marked', filePath), MINIFIED);
    temp.write('marked/.gitattributes', `${lines.join('\n')}\n`);
    execFileSync('git', ['-C', temp.dir, 'add', '--all']);
    using _marked = pointCwdAt(marked);

    await expect(listForeignPaths()).resolves.toStrictEqual(new Set(paths));
  });

  it('leaves a flagged file in the sweep', async ({ temp }) => {
    temp.write('dist/app.mjs', MINIFIED);
    initRepository(temp);
    using _cwd = pointCwdAt(temp.dir);
    const ledger = createPragmaLedger();

    const swept = await readTrackedSources();
    ledger.recordScanned((swept ?? []).map((source) => source.path));
    const { warnings } = await warn(ledger);

    expect(swept?.map((source) => source.path)).toStrictEqual(['dist/app.mjs']);
    expect(warnings).toHaveLength(1);
  });

  it('warns about nothing outside a git working tree', async ({ temp }) => {
    temp.write('dist/app.mjs', MINIFIED);
    using _cwd = pointCwdAt(temp.dir);

    const { warnings } = await warn(scanning(['dist/app.mjs']));

    expect(warnings).toStrictEqual([]);
  });
});

// region | Helpers

/** Initializes a git repository over the temporary directory and stages everything in it. */
function initRepository(temp: TempTree): void {
  execFileSync('git', ['-C', temp.dir, 'init', '--quiet']);
  // Repository config outranks the global one, so this keeps a developer's `core.attributesFile` out.
  execFileSync('git', ['-C', temp.dir, 'config', 'core.attributesFile', '/dev/null']);
  execFileSync('git', ['-C', temp.dir, 'add', '--all']);
}

/** Opens a ledger recording the given paths as examined. */
function scanning(paths: readonly string[]): PragmaLedger {
  const ledger = createPragmaLedger();
  ledger.recordScanned(paths);
  return ledger;
}

/** Reports over one ledger, returning the warnings alongside everything that the call wrote to stderr. */
async function warn(ledger: PragmaLedger) {
  using io = captureStdio();

  const warnings = await warnOnUnmarkedGeneratedSources(ledger);

  return { warnings, stderr: io.stderr };
}

// endregion | Helpers
