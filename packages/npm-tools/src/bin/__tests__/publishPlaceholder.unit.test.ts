import fs from 'node:fs';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { FindVersionOutcome, PublishOutcome, WhoamiOutcome } from '../../npm/createNpmClient.ts';
import { planPublishPlaceholder, publishPlaceholder, type PublishPlaceholderOptions } from '../publishPlaceholder.ts';
import { createNpmStub } from '../test-utils/createNpmStub.ts';

const NAME = '@scope/new-pkg';

describe(planPublishPlaceholder, () => {
  it('is ready when npm is logged in and the registry does not have the name', () => {
    const { npmCalls, plan } = planWith();

    expect(plan()).toStrictEqual({ kind: 'ready', name: NAME });
    expect(npmCalls).toStrictEqual(['whoami', `view ${NAME}`]);
  });

  it.each([
    { options: { dryRun: true }, case: 'a dry run' },
    { options: { force: true }, case: '--force' },
  ])('does not need a terminal on stdin for $case', ({ options }) => {
    const { plan } = planWith({ isStdinTty: false });

    expect(plan(options)).toMatchObject({ kind: 'ready' });
  });

  it('refuses a non-terminal stdin without --force or --dry-run, before calling npm', () => {
    const { npmCalls, plan } = planWith({ isStdinTty: false });

    expect(() => plan()).toThrow(/needs a terminal on stdin; pass --force/);
    expect(npmCalls).toStrictEqual([]);
  });

  it("refuses an invalid name with npm's reasons, before calling npm", () => {
    const { npmCalls, plan } = planWith();

    expect(() => plan({ name: 'node_modules' })).toThrow(
      /invalid package name 'node_modules':\n {2}node_modules is not a valid package name/,
    );
    expect(npmCalls).toStrictEqual([]);
  });

  it.each([
    {
      case: 'npm is missing',
      calls: ['whoami'],
      npm: { whoami: { kind: 'missing' } },
      expected: { kind: 'npm-missing' },
    },
    {
      case: 'npm is logged out',
      calls: ['whoami'],
      npm: { whoami: { kind: 'logged-out', detail: 'need auth' } },
      expected: { kind: 'logged-out', detail: 'need auth' },
    },
    {
      case: 'the npm session check fails',
      calls: ['whoami'],
      npm: { whoami: { kind: 'failed', detail: 'request failed' } },
      expected: { kind: 'session-failed', detail: 'request failed' },
    },
    {
      case: 'the name exists',
      calls: ['whoami', `view ${NAME}`],
      npm: { findVersion: { kind: 'found' } },
      expected: { kind: 'name-taken', name: NAME },
    },
    {
      case: 'the registry cannot be queried',
      calls: ['whoami', `view ${NAME}`],
      npm: { findVersion: { kind: 'failed', detail: 'request failed' } },
      expected: { kind: 'lookup-failed', detail: 'request failed', name: NAME },
    },
  ] as const)('refuses when $case', ({ calls, expected, npm }) => {
    const { npmCalls, plan } = planWith({ npm });

    expect(plan()).toStrictEqual(expected);
    expect(npmCalls).toStrictEqual(calls);
  });
});

describe(publishPlaceholder, () => {
  it('publishes the placeholder files, then removes their directory', () => {
    using tree = createTempTree({ 'tmp/': '' });
    const dirs = trackTempDirs(tree.resolve('tmp'));
    const published: Array<Record<string, string>> = [];

    const outcome = publishPlaceholder(NAME, {
      createTempDir: dirs.create,
      npm: createNpmStub({
        publish: (publishDir) => {
          published.push(readFiles(publishDir));
          return { kind: 'published' };
        },
      }),
    });

    expect(outcome).toStrictEqual({ kind: 'published', name: NAME });
    expect(published).toStrictEqual([
      {
        'README.md': `Placeholder for \`${NAME}\`, awaiting first release.\n`,
        'package.json': `{\n  "name": "${NAME}",\n  "version": "0.0.0"\n}\n`,
      },
    ]);
    expect(dirs.leftover()).toStrictEqual([]);
  });

  it('reports a failed publish and removes the directory', () => {
    using tree = createTempTree({ 'tmp/': '' });
    const dirs = trackTempDirs(tree.resolve('tmp'));
    const failure: PublishOutcome = { kind: 'failed', detail: 'exit 1' };

    const outcome = publishPlaceholder(NAME, {
      createTempDir: dirs.create,
      npm: createNpmStub({ publish: () => failure }),
    });

    expect(outcome).toStrictEqual({ kind: 'failed', detail: 'exit 1' });
    expect(dirs.leftover()).toStrictEqual([]);
  });
});

// region | Helpers

/** Returns a plan runner whose npm finds a free name and a logged-in session unless the settings say otherwise. */
function planWith(
  settings: {
    readonly isStdinTty?: boolean;
    readonly npm?: { readonly findVersion?: FindVersionOutcome; readonly whoami?: WhoamiOutcome };
  } = {},
): { npmCalls: string[]; plan: (options?: Partial<PublishPlaceholderOptions>) => unknown } {
  const npmCalls: string[] = [];
  const npm = createNpmStub({
    findVersion: (name) => {
      npmCalls.push(`view ${name}`);
      return settings.npm?.findVersion ?? { kind: 'absent' };
    },
    whoami: () => {
      npmCalls.push('whoami');
      return settings.npm?.whoami ?? { kind: 'logged-in', username: 'someone' };
    },
  });

  return {
    npmCalls,
    plan: (options = {}) =>
      planPublishPlaceholder(
        { dryRun: false, force: false, name: NAME, ...options },
        { isStdinTty: () => settings.isStdinTty ?? true, npm },
      ),
  };
}

/** Reads every file directly inside a directory, keyed by name. */
function readFiles(dir: string): Record<string, string> {
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .toSorted()
      .map((file) => [file, fs.readFileSync(path.join(dir, file), 'utf8')]),
  );
}

/** Returns a `createTempDir` that makes each directory under `root`, and lists those that still exist. */
function trackTempDirs(root: string): { create: () => string; leftover: () => string[] } {
  const created: string[] = [];

  return {
    create: () => {
      const dir = fs.mkdtempSync(path.join(root, 'placeholder-'));
      created.push(dir);
      return dir;
    },
    leftover: () => created.filter((dir) => fs.existsSync(dir)),
  };
}

// endregion | Helpers
