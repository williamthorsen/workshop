import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import packageJson from '../../../package.json' with { type: 'json' };
import type { FromSource } from '../../kits/parseFromValue.ts';
import type { KitSpecifier } from '../parseKitSpecifiers.ts';
import { resolveFromSource } from '../resolveFromSource.ts';

/** Repo root, which is where the workspace link for `readyup` lives. */
const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

/** The kit an invocation naming none has already been filled with by the time this resolver runs. */
const DEFAULT_SPECS: KitSpecifier[] = [{ kitName: 'default', checklists: [] }];

describe(resolveFromSource, () => {
  // -- github: source --

  it('builds a GitHub raw content URL for the named kit', () => {
    const source: FromSource = { type: 'github', org: 'org', repo: 'repo', ref: 'main' };

    expect(resolveFromSource(source, [{ kitName: 'nmr', checklists: [] }], '.js')).toStrictEqual([
      {
        name: 'nmr',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/nmr.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'github:org/repo@main' },
      },
    ]);
  });

  it('passes the GitHub ref into both the URL and the label', () => {
    const source: FromSource = { type: 'github', org: 'org', repo: 'repo', ref: 'v1' };

    expect(resolveFromSource(source, [{ kitName: 'nmr', checklists: [] }], '.js')).toStrictEqual([
      {
        name: 'nmr',
        source: { url: 'https://raw.githubusercontent.com/org/repo/v1/.readyup/kits/nmr.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'github:org/repo@v1' },
      },
    ]);
  });

  it('resolves multiple kits against one GitHub source', () => {
    const source: FromSource = { type: 'github', org: 'org', repo: 'repo', ref: 'main' };
    const specs: KitSpecifier[] = [
      { kitName: 'deploy', checklists: [] },
      { kitName: 'infra', checklists: ['c1'] },
    ];

    expect(resolveFromSource(source, specs, '.js')).toStrictEqual([
      {
        name: 'deploy',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/deploy.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'github:org/repo@main' },
      },
      {
        name: 'infra',
        source: { url: 'https://raw.githubusercontent.com/org/repo/main/.readyup/kits/infra.js' },
        checklists: ['c1'],
        provenance: { kind: 'remote', label: 'github:org/repo@main' },
      },
    ]);
  });

  // -- bitbucket: source --

  it('builds a Bitbucket Cloud API source URL for the named kit', () => {
    const source: FromSource = { type: 'bitbucket', workspace: 'myteam', repo: 'deploy-checks', ref: 'main' };

    expect(resolveFromSource(source, [{ kitName: 'deploy', checklists: [] }], '.js')).toStrictEqual([
      {
        name: 'deploy',
        source: {
          url: 'https://api.bitbucket.org/2.0/repositories/myteam/deploy-checks/src/main/.readyup/kits/deploy.js',
        },
        checklists: [],
        provenance: { kind: 'remote', label: 'bitbucket:myteam/deploy-checks@main' },
      },
    ]);
  });

  it('passes the Bitbucket ref into both the URL and the label', () => {
    const source: FromSource = { type: 'bitbucket', workspace: 'myteam', repo: 'repo', ref: 'v2' };

    expect(resolveFromSource(source, DEFAULT_SPECS, '.js')).toStrictEqual([
      {
        name: 'default',
        source: { url: 'https://api.bitbucket.org/2.0/repositories/myteam/repo/src/v2/.readyup/kits/default.js' },
        checklists: [],
        provenance: { kind: 'remote', label: 'bitbucket:myteam/repo@v2' },
      },
    ]);
  });

  // -- npm: source --

  // `readyup` is linked into this repo's node_modules as a workspace package, so it stands in for any
  // installed dependency without needing a fixture.
  it('resolves a kit inside an installed package', () => {
    const source: FromSource = { type: 'npm', name: 'readyup', versionSpec: undefined };
    const [entry] = resolveFromSource(source, DEFAULT_SPECS, '.js');

    expect(entry?.name).toBe('default');
    expect(entry?.source).toStrictEqual({
      path: path.join(REPO_ROOT, 'packages', 'readyup', '.readyup', 'kits', 'default.js'),
    });
  });

  it('resolves a named kit inside an installed package', () => {
    const source: FromSource = { type: 'npm', name: 'readyup', versionSpec: undefined };
    const [entry] = resolveFromSource(source, [{ kitName: 'drift', checklists: [] }], '.js');

    expect(entry?.source).toStrictEqual({
      path: path.join(REPO_ROOT, 'packages', 'readyup', '.readyup', 'kits', 'drift.js'),
    });
  });

  // The provenance is what names the copy a check ran against, which is the whole point of resolving from an
  // installed package. It reads from the same manifest the resolver reads, so a version bump leaves this alone.
  it('reports the package and its installed version as the kit provenance', () => {
    const source: FromSource = { type: 'npm', name: 'readyup', versionSpec: undefined };
    const [entry] = resolveFromSource(source, DEFAULT_SPECS, '.js');

    expect(entry?.provenance).toStrictEqual({
      kind: 'package',
      packageName: 'readyup',
      version: packageJson.version,
    });
  });

  it('rejects a version spec by naming the flag that reaches a published kit', () => {
    const source: FromSource = { type: 'npm', name: 'readyup', versionSpec: '0.22.0' };

    expect(() => resolveFromSource(source, DEFAULT_SPECS, '.js')).toThrow(/not supported yet[\s\S]*--url/);
  });

  it('rejects an uninstalled package by naming the direct-dependency requirement', () => {
    const source: FromSource = { type: 'npm', name: 'readyup-package-that-does-not-exist', versionSpec: undefined };

    expect(() => resolveFromSource(source, DEFAULT_SPECS, '.js')).toThrow(
      /is not installed; it must be a direct dependency/,
    );
  });

  // -- global source --

  it('resolves global to the home directory', () => {
    const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '~';

    expect(resolveFromSource({ type: 'global' }, DEFAULT_SPECS, '.js')).toStrictEqual([
      {
        name: 'default',
        source: { path: `${homeDir}/.readyup/kits/default.js` },
        checklists: [],
        provenance: { kind: 'directory', label: '~/.readyup/kits' },
      },
    ]);
  });

  // -- dir: source --

  it('resolves a directory source to the kits it holds directly', () => {
    const resolved = path.resolve(process.cwd(), 'custom/kits');

    expect(resolveFromSource({ type: 'directory', path: 'custom/kits' }, DEFAULT_SPECS, '.js')).toStrictEqual([
      {
        name: 'default',
        source: { path: `${resolved}/default.js` },
        checklists: [],
        provenance: { kind: 'directory', label: 'custom/kits' },
      },
    ]);
  });

  // -- local source --

  it('resolves a local path to a .js path under .readyup/kits/', () => {
    expect(resolveFromSource({ type: 'local', path: '/path/to/repo' }, DEFAULT_SPECS, '.js')).toStrictEqual([
      {
        name: 'default',
        source: { path: '/path/to/repo/.readyup/kits/default.js' },
        checklists: [],
        provenance: { kind: 'directory', label: '/path/to/repo/.readyup/kits' },
      },
    ]);
  });

  it('resolves a relative local path against cwd', () => {
    const expected = path.resolve(process.cwd(), '../sibling-repo');

    expect(resolveFromSource({ type: 'local', path: '../sibling-repo' }, DEFAULT_SPECS, '.js')).toStrictEqual([
      {
        name: 'default',
        source: { path: `${expected}/.readyup/kits/default.js` },
        checklists: [],
        provenance: { kind: 'directory', label: '../sibling-repo/.readyup/kits' },
      },
    ]);
  });

  it('resolves multiple kits against one local path', () => {
    const specs: KitSpecifier[] = [
      { kitName: 'deploy', checklists: [] },
      { kitName: 'infra', checklists: [] },
    ];

    expect(resolveFromSource({ type: 'local', path: '/path/to/repo' }, specs, '.js')).toStrictEqual([
      {
        name: 'deploy',
        source: { path: '/path/to/repo/.readyup/kits/deploy.js' },
        checklists: [],
        provenance: { kind: 'directory', label: '/path/to/repo/.readyup/kits' },
      },
      {
        name: 'infra',
        source: { path: '/path/to/repo/.readyup/kits/infra.js' },
        checklists: [],
        provenance: { kind: 'directory', label: '/path/to/repo/.readyup/kits' },
      },
    ]);
  });

  // -- extension --

  it('applies the extension it is given to every kit path', () => {
    expect(resolveFromSource({ type: 'local', path: '/path/to/repo' }, DEFAULT_SPECS, '.ts')).toStrictEqual([
      {
        name: 'default',
        source: { path: '/path/to/repo/.readyup/kits/default.ts' },
        checklists: [],
        provenance: { kind: 'directory', label: '/path/to/repo/.readyup/kits' },
      },
    ]);
  });
});
