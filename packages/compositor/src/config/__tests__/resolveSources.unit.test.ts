import { homedir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveSources } from '../resolveSources.ts';
import { buildConfig } from '../test-utils/buildConfig.ts';
import { buildConfigDir } from '../test-utils/buildConfigDir.ts';

const options = { contentKeyPath: ['compositor', 'content'] };

describe(resolveSources, () => {
  it('runs a tier’s own sources in author order, so precedence descends down the page', async () => {
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

    await expect(collectNames(config)).resolves.toStrictEqual(['mine', 'theirs']);
  });

  it('runs a higher tier’s sources ahead of a lower tier’s', async () => {
    const config = buildConfig([
      { id: 'global', sources: { use: [{ name: 'shared', path: './shared' }] } },
      { id: 'project', sources: { use: [{ name: 'local', path: './local' }] } },
    ]);

    await expect(collectNames(config)).resolves.toStrictEqual(['local', 'shared']);
  });

  it('lets a higher tier remap an inherited source, which takes the higher tier’s position', async () => {
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
      { id: 'project', baseDir: '/srv/app', sources: { use: [{ name: 'shared', path: './elsewhere' }] } },
    ]);

    const { sources } = await resolveSources(config, options);

    expect(sources.map(({ name, dir }) => [name, dir])).toStrictEqual([
      ['shared', '/srv/app/elsewhere'],
      ['other', '/srv/app/other'],
    ]);
  });

  it('drops an inherited source and records the decline', async () => {
    const config = buildConfig([
      { sources: { use: [{ name: 'vendor', path: './vendor' }] } },
      { sources: { drop: ['vendor'] } },
    ]);

    await expect(resolveSources(config, options)).resolves.toMatchObject({ sources: [], declined: ['vendor'] });
  });

  // Adopted and declined stay disjoint, so a re-adoption is not reported as a decline as well.
  it('clears the decline when a higher tier re-adopts a dropped source', async () => {
    const config = buildConfig([
      { sources: { use: [{ name: 'vendor', path: './vendor' }] } },
      { sources: { drop: ['vendor'] } },
      { sources: { use: [{ name: 'vendor', path: './vendor' }] } },
    ]);

    await expect(resolveSources(config, options)).resolves.toMatchObject({ declined: [] });
    await expect(collectNames(config)).resolves.toStrictEqual(['vendor']);
  });

  it('discards every lower tier’s sources and declines at a tier declaring reset', async () => {
    const config = buildConfig([
      { sources: { use: [{ name: 'shared', path: './shared' }], drop: ['vendor'] } },
      { reset: true, sources: { use: [{ name: 'local', path: './local' }] } },
    ]);

    await expect(resolveSources(config, options)).resolves.toMatchObject({ declined: [] });
    await expect(collectNames(config)).resolves.toStrictEqual(['local']);
  });

  it.each([
    ['a relative path against the declaring tier', './content', path.join('/srv/tier', 'content')],
    ['an absolute path unchanged', '/srv/elsewhere', '/srv/elsewhere'],
    ['a home-relative path', '~/guidance', path.join(homedir(), 'guidance')],
  ])('resolves %s', async (_label, location, expected) => {
    const config = buildConfig([{ baseDir: '/srv/tier', sources: { use: [{ name: 'x', path: location }] } }]);

    const { sources } = await resolveSources(config, options);

    expect(sources.at(0)?.dir).toBe(expected);
  });

  // The declaration a consumer wrote is what a plan reports, so resolving must not overwrite it.
  it('keeps the origin as declared beside the directory it resolved to', async () => {
    const config = buildConfig([{ baseDir: '/srv/tier', sources: { use: [{ name: 'x', path: './content' }] } }]);

    const { sources } = await resolveSources(config, options);

    expect(sources.at(0)?.origin).toStrictEqual({ kind: 'directory', location: './content' });
  });

  it('locates a declared package at the content directory it ships', async () => {
    const baseDir = await buildConfigDir({
      'node_modules/@acme/guidance/package.json': JSON.stringify({
        name: '@acme/guidance',
        compositor: { content: 'dist/content' },
      }),
    });
    const config = buildConfig([{ baseDir, sources: { use: [{ name: 'acme', package: '@acme/guidance' }] } }]);

    const { sources } = await resolveSources(config, options);

    expect(sources.at(0)?.dir).toBe(path.join(baseDir, 'node_modules/@acme/guidance/dist/content'));
  });

  it('fails on a package it cannot locate, naming the source and the tier', async () => {
    const baseDir = await buildConfigDir({});
    const config = buildConfig([
      { id: 'project', baseDir, sources: { use: [{ name: 'acme', package: '@acme/absent' }] } },
    ]);

    await expect(resolveSources(config, options)).rejects.toThrow(/Source "acme", declared by tier "project"/);
  });
});

// region | Helpers

/** Collects the resolved source names, in precedence order. */
async function collectNames(config: Parameters<typeof resolveSources>[0]): Promise<Array<string>> {
  const { sources } = await resolveSources(config, options);
  return sources.map(({ name }) => name);
}

// endregion | Helpers
