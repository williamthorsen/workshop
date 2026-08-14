import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildConfig } from '../../test-utils/buildConfig.ts';
import { foldSourceTiers } from '../foldSourceTiers.ts';
import type { PackageLocation } from '../locateSourcePackages.ts';
import { StaleSnapshotError } from '../StaleSnapshotError.ts';

const acme: PackageLocation = {
  outcome: 'located',
  package: '@acme/guidance',
  baseDir: '/srv/app',
  dir: '/srv/app/node_modules/@acme/guidance/content',
};

describe(foldSourceTiers, () => {
  it('runs a tier’s own sources in author order, so precedence descends down the page', () => {
    const config = buildConfig([
      {
        sources: {
          use: [
            { name: 'mine', path: './a' },
            { name: 'theirs', path: './b' },
          ],
        },
      },
    ]);

    expect(collectNames(config)).toStrictEqual(['mine', 'theirs']);
  });

  it('runs a higher tier’s sources ahead of a lower tier’s', () => {
    const config = buildConfig([
      { id: 'global', sources: { use: [{ name: 'shared', path: './shared' }] } },
      { id: 'project', sources: { use: [{ name: 'local', path: './local' }] } },
    ]);

    expect(collectNames(config)).toStrictEqual(['local', 'shared']);
  });

  it('lets a higher tier remap an inherited source, which takes the higher tier’s position', () => {
    const config = buildConfig([
      {
        id: 'global',
        sources: {
          use: [
            { name: 'shared', path: './shared' },
            { name: 'other', path: './other' },
          ],
        },
      },
      { id: 'project', sources: { use: [{ name: 'shared', path: './elsewhere' }] } },
    ]);

    const { sources } = foldSourceTiers(config, []);

    expect(sources.map(({ name, dir }) => [name, dir])).toStrictEqual([
      ['shared', '/srv/app/elsewhere'],
      ['other', '/srv/app/other'],
    ]);
  });

  it('drops an inherited source and records the decline', () => {
    const config = buildConfig([
      { sources: { use: [{ name: 'vendor', path: './vendor' }] } },
      { sources: { drop: ['vendor'] } },
    ]);

    expect(foldSourceTiers(config, [])).toMatchObject({ sources: [], declined: ['vendor'] });
  });

  // Adopted and declined stay disjoint, so a re-adoption is not reported as a decline as well.
  it('clears the decline when a higher tier re-adopts a dropped source', () => {
    const config = buildConfig([
      { sources: { use: [{ name: 'vendor', path: './vendor' }] } },
      { sources: { drop: ['vendor'] } },
      { sources: { use: [{ name: 'vendor', path: './vendor' }] } },
    ]);

    expect(foldSourceTiers(config, [])).toMatchObject({ declined: [] });
    expect(collectNames(config)).toStrictEqual(['vendor']);
  });

  it('discards every lower tier’s sources and declines at a tier declaring shouldReset', () => {
    const config = buildConfig([
      { sources: { use: [{ name: 'shared', path: './shared' }], drop: ['vendor'] } },
      { shouldReset: true, sources: { use: [{ name: 'local', path: './local' }] } },
    ]);

    expect(foldSourceTiers(config, [])).toMatchObject({ declined: [] });
    expect(collectNames(config)).toStrictEqual(['local']);
  });

  // Both tiers declare the same relative path, so anchoring every tier at one base directory collapses the two answers.
  it('anchors a relative path at the tier that declared it, not at the last tier', () => {
    const config = buildConfig([
      { id: 'global', baseDir: '/srv/global', sources: { use: [{ name: 'shared', path: './content' }] } },
      { id: 'project', baseDir: '/srv/project', sources: { use: [{ name: 'local', path: './content' }] } },
    ]);

    const { sources } = foldSourceTiers(config, []);

    expect(sources.map(({ name, dir }) => [name, dir])).toStrictEqual([
      ['local', path.join('/srv/project', 'content')],
      ['shared', path.join('/srv/global', 'content')],
    ]);
  });

  it('keeps the origin as declared beside the directory it resolved to', () => {
    const config = buildConfig([{ baseDir: '/srv/tier', sources: { use: [{ name: 'x', path: './content' }] } }]);

    const { sources } = foldSourceTiers(config, []);

    expect(sources.at(0)?.origin).toStrictEqual({ kind: 'directory', location: './content' });
  });

  it('reads a package’s directory from its location', () => {
    const config = buildConfig([{ sources: { use: [{ name: 'acme', package: '@acme/guidance' }] } }]);

    const { sources } = foldSourceTiers(config, [acme]);

    expect(sources.at(0)?.dir).toBe(acme.dir);
  });

  // The two spellings name one directory, so a fold that compared them literally would call the location missing.
  it('matches a location whose base directory is spelled differently', () => {
    const config = buildConfig([
      { baseDir: '/srv/app/', sources: { use: [{ name: 'acme', package: '@acme/guidance' }] } },
    ]);

    const { sources } = foldSourceTiers(config, [acme]);

    expect(sources.at(0)?.dir).toBe(acme.dir);
  });

  // One package name resolves to different copies per tier, so a location is keyed by base directory as well.
  it('reads the location belonging to the tier that declared the package', () => {
    const config = buildConfig([
      { id: 'global', baseDir: '/srv/global', sources: { use: [{ name: 'inherited', package: '@acme/guidance' }] } },
      { id: 'project', baseDir: '/srv/project', sources: { use: [{ name: 'own', package: '@acme/guidance' }] } },
    ]);

    const { sources } = foldSourceTiers(config, [
      { outcome: 'located', package: '@acme/guidance', baseDir: '/srv/global', dir: '/global-content' },
      { outcome: 'located', package: '@acme/guidance', baseDir: '/srv/project', dir: '/project-content' },
    ]);

    expect(sources.map(({ dir }) => dir)).toStrictEqual(['/project-content', '/global-content']);
  });

  it('raises a failed location for a package it adopts, naming the source and the tier', () => {
    const config = buildConfig([{ id: 'project', sources: { use: [{ name: 'acme', package: '@acme/absent' }] } }]);
    const locations: Array<PackageLocation> = [
      { outcome: 'failed', package: '@acme/absent', baseDir: '/srv/app', reason: 'is not installed' },
    ];

    expect(() => foldSourceTiers(config, locations)).toThrow(
      /Source "acme", declared by tier "project": is not installed/,
    );
  });

  // Locating runs ahead of the fold and cannot know what survives it, so a package nothing adopts must not fail the
  // config -- which is what the fold resolving before it reads a location preserves.
  it('ignores a failed location for a package no tier adopts', () => {
    const config = buildConfig([
      { sources: { use: [{ name: 'vendor', package: '@acme/absent' }] } },
      { sources: { drop: ['vendor'] } },
    ]);
    const locations: Array<PackageLocation> = [
      { outcome: 'failed', package: '@acme/absent', baseDir: '/srv/app', reason: 'is not installed' },
    ];

    expect(foldSourceTiers(config, locations)).toStrictEqual({ sources: [], declined: ['vendor'] });
  });

  it('re-adopts a dropped package from the location already held', () => {
    const config = buildConfig([
      { sources: { use: [{ name: 'acme', package: '@acme/guidance' }] } },
      { sources: { drop: ['acme'] } },
      { sources: { use: [{ name: 'acme', package: '@acme/guidance' }] } },
    ]);

    expect(foldSourceTiers(config, [acme]).sources.at(0)?.dir).toBe(acme.dir);
  });

  it('raises a stale-snapshot error for an adopted package no location answers', () => {
    const config = buildConfig([{ id: 'project', sources: { use: [{ name: 'acme', package: '@acme/added' }] } }]);

    expect(() => foldSourceTiers(config, [acme])).toThrow(StaleSnapshotError);
    expect(() => foldSourceTiers(config, [acme])).toThrow(/Source "acme", declared by tier "project"/);
  });

  it('carries the unanswered package on the stale-snapshot error', () => {
    const config = buildConfig([
      { baseDir: '/srv/here', sources: { use: [{ name: 'acme', package: '@acme/added' }] } },
    ]);

    expect(() => foldSourceTiers(config, [])).toThrow(
      expect.objectContaining({ package: '@acme/added', baseDir: '/srv/here' }),
    );
  });
});

// region | Helpers

/** Collects the folded source names, in precedence order, for a config declaring no packages. */
function collectNames(config: Parameters<typeof foldSourceTiers>[0]): Array<string> {
  return foldSourceTiers(config, []).sources.map(({ name }) => name);
}

// endregion | Helpers
