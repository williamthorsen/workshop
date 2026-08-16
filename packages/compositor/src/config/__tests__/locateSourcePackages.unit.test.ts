import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildConfig } from '../../test-utils/buildConfig.ts';
import { locateSourcePackages } from '../locateSourcePackages.ts';
import { buildConfigDir } from '../test-utils/buildConfigDir.ts';

const options = { contentKeyPath: ['compositor', 'content'] };

const manifest = JSON.stringify({ name: '@acme/guidance', compositor: { content: 'dist/content' } });

describe(locateSourcePackages, () => {
  it('locates a declared package at the content directory it ships', async () => {
    const baseDir = buildConfigDir({ 'node_modules/@acme/guidance/package.json': manifest });
    const config = buildConfig([{ baseDir, sources: { use: [{ name: 'acme', package: '@acme/guidance' }] } }]);

    await expect(locateSourcePackages(config, options)).resolves.toStrictEqual([
      {
        outcome: 'located',
        package: '@acme/guidance',
        baseDir,
        dir: path.join(baseDir, 'node_modules/@acme/guidance/dist/content'),
      },
    ]);
  });

  it('ignores a path source, which needs no walk', async () => {
    const config = buildConfig([{ sources: { use: [{ name: 'local', path: './content' }] } }]);

    await expect(locateSourcePackages(config, options)).resolves.toStrictEqual([]);
  });

  // A throw here would fail a config that works today, since a package a later tier drops is one this walk still sees.
  it('records a package it cannot locate rather than throwing', async () => {
    const baseDir = buildConfigDir({});
    const config = buildConfig([{ baseDir, sources: { use: [{ name: 'acme', package: '@acme/absent' }] } }]);

    const [location] = await locateSourcePackages(config, options);

    expect(location).toMatchObject({ outcome: 'failed', package: '@acme/absent', baseDir });
    expect(location).toHaveProperty('reason', expect.stringContaining('is not installed'));
  });

  it('walks a package a later tier drops, so a fold may re-adopt it', async () => {
    const baseDir = buildConfigDir({ 'node_modules/@acme/guidance/package.json': manifest });
    const config = buildConfig([
      { baseDir, sources: { use: [{ name: 'acme', package: '@acme/guidance' }] } },
      { baseDir, sources: { drop: ['acme'] } },
    ]);

    await expect(locateSourcePackages(config, options)).resolves.toMatchObject([{ outcome: 'located' }]);
  });

  it('walks one package and base directory once, however many tiers declare it', async () => {
    const baseDir = buildConfigDir({ 'node_modules/@acme/guidance/package.json': manifest });
    const config = buildConfig([
      { baseDir, sources: { use: [{ name: 'acme', package: '@acme/guidance' }] } },
      { baseDir: `${baseDir}/`, sources: { use: [{ name: 'acme-again', package: '@acme/guidance' }] } },
    ]);

    await expect(locateSourcePackages(config, options)).resolves.toHaveLength(1);
  });

  // Each tier installs its own copy under one package name, so the two are separate questions with separate answers.
  it('walks one package once per base directory that declares it', async () => {
    const root = buildConfigDir({
      'global/node_modules/@acme/guidance/package.json': manifest,
      'project/node_modules/@acme/guidance/package.json': manifest,
    });
    const config = buildConfig([
      {
        id: 'global',
        baseDir: path.join(root, 'global'),
        sources: { use: [{ name: 'inherited', package: '@acme/guidance' }] },
      },
      {
        id: 'project',
        baseDir: path.join(root, 'project'),
        sources: { use: [{ name: 'own', package: '@acme/guidance' }] },
      },
    ]);

    const locations = await locateSourcePackages(config, options);

    expect(locations.map((location) => (location.outcome === 'located' ? location.dir : undefined))).toStrictEqual([
      path.join(root, 'global/node_modules/@acme/guidance/dist/content'),
      path.join(root, 'project/node_modules/@acme/guidance/dist/content'),
    ]);
  });
});
