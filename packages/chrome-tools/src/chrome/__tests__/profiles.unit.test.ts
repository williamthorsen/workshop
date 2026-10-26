import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { composeProfileName, isBranchGone, resolveProfileFacts } from '../profiles.ts';
import { makeFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';

describe(composeProfileName, () => {
  it('kebab-cases the repository and branch into one segment, dropping characters that a name may not contain', () => {
    expect(composeProfileName('macos', '321')).toBe('macos-321');
    expect(composeProfileName('widget', 'MAC-42/feat/Widget+x')).toBe('widget-mac-42-feat-widgetx');
  });
});

describe(isBranchGone, () => {
  it('reports a branch gone only when git read the repository and found no such branch', () => {
    const fake = makeFakeThorChrome({ results: { 'git -C': { status: 1 } } });
    expect(isBranchGone(fake.makeInvocation(), fake.home, '9')).toBe(false);

    const readable = makeFakeThorChrome({ results: { [`git -C`]: { status: 0 } } });
    expect(isBranchGone(readable.makeInvocation(), readable.home, '9')).toBe(false);

    const gone = makeFakeThorChrome({ results: {} });
    gone.deps.run = (_program, args) => ({ status: args.includes('show-ref') ? 1 : 0, stderr: '', stdout: '' });
    expect(isBranchGone(gone.makeInvocation(), gone.home, '9')).toBe(true);
  });

  it('reports a repository gone only when its parent can be searched and lacks it', () => {
    const fake = makeFakeThorChrome();
    expect(isBranchGone(fake.makeInvocation(), `${fake.home}/gone`, '9')).toBe(true);

    fs.mkdirSync(`${fake.home}/locked`);
    fs.chmodSync(`${fake.home}/locked`, 0o000);
    try {
      expect(isBranchGone(fake.makeInvocation(), `${fake.home}/locked/repo`, '9')).toBe(false);
    } finally {
      fs.chmodSync(`${fake.home}/locked`, 0o755);
    }
  });
});

describe(resolveProfileFacts, () => {
  it('reads a derived record and its staleness, and the directory mtime as its last use', () => {
    const fake = makeFakeThorChrome();
    const dir = fake.makeProfile('widget-9', {
      origin: 'derived',
      branch: '9',
      repo: 'widget',
      repo_dir: `${fake.home}/gone`,
    });
    fs.utimesSync(dir, 1_000, 1_000);
    expect(resolveProfileFacts(fake.makeInvocation(), dir)).toStrictEqual({
      branch: '9',
      lastUsed: 1_000,
      origin: 'derived',
      repo: 'widget',
      repoDir: `${fake.home}/gone`,
      stale: true,
    });
  });

  it('reports a derived record without a branch as unrecorded, and a named one as never stale', () => {
    const fake = makeFakeThorChrome();
    const partial = fake.makeProfile('partial', { origin: 'derived' });
    const named = fake.makeProfile('named', { origin: 'named' });
    expect(resolveProfileFacts(fake.makeInvocation(), partial)).toMatchObject({ origin: undefined, stale: undefined });
    expect(resolveProfileFacts(fake.makeInvocation(), named)).toMatchObject({ origin: 'named', stale: false });
  });

  it('reports nothing for a directory that does not exist', () => {
    const fake = makeFakeThorChrome();
    expect(resolveProfileFacts(fake.makeInvocation(), `${fake.profilesDir}/absent`)).toMatchObject({
      lastUsed: undefined,
      origin: undefined,
    });
  });
});
