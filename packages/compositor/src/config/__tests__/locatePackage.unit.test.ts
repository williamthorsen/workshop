import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { locatePackage } from '../locatePackage.ts';
import { buildConfigDir } from '../test-utils/buildConfigDir.ts';

const contentKeyPath = ['compositor', 'content'];

describe(locatePackage, () => {
  it('joins the installed directory to the content directory the package declares', async () => {
    const baseDir = await buildConfigDir({
      'node_modules/guidance/package.json': JSON.stringify({ compositor: { content: 'content' } }),
    });

    await expect(locatePackage('guidance', { baseDir, contentKeyPath })).resolves.toBe(
      path.join(baseDir, 'node_modules/guidance/content'),
    );
  });

  it('reads the content key at whatever path the consumer names', async () => {
    const baseDir = await buildConfigDir({
      'node_modules/guidance/package.json': JSON.stringify({ rulebinder: { guidance: { dir: 'share' } } }),
    });

    await expect(
      locatePackage('guidance', { baseDir, contentKeyPath: ['rulebinder', 'guidance', 'dir'] }),
    ).resolves.toBe(path.join(baseDir, 'node_modules/guidance/share'));
  });

  // Whether the directory exists is the caller's source validation to answer, so both source forms fail through it.
  it('does not require the content directory to exist', async () => {
    const baseDir = await buildConfigDir({
      'node_modules/guidance/package.json': JSON.stringify({ compositor: { content: 'nowhere' } }),
    });

    await expect(locatePackage('guidance', { baseDir, contentKeyPath })).resolves.toContain('nowhere');
  });

  it('fails when the package is not installed, listing where it looked', async () => {
    const baseDir = await buildConfigDir({});

    await expect(locatePackage('guidance', { baseDir, contentKeyPath })).rejects.toThrow(/is not installed. Searched:/);
  });

  it('fails when the package declares no content directory, naming the key path', async () => {
    const baseDir = await buildConfigDir({
      'node_modules/guidance/package.json': JSON.stringify({ name: 'guidance' }),
    });

    await expect(locatePackage('guidance', { baseDir, contentKeyPath })).rejects.toThrow(/compositor\.content/);
  });

  it('fails when the content key holds something other than a directory name', async () => {
    const baseDir = await buildConfigDir({
      'node_modules/guidance/package.json': JSON.stringify({ compositor: { content: {} } }),
    });

    await expect(locatePackage('guidance', { baseDir, contentKeyPath })).rejects.toThrow(/declares no content/);
  });

  it('fails when the package manifest will not parse, naming the package', async () => {
    const baseDir = await buildConfigDir({ 'node_modules/guidance/package.json': '{ not json' });

    await expect(locatePackage('guidance', { baseDir, contentKeyPath })).rejects.toThrow(
      /"guidance" has an unreadable/,
    );
  });

  // A relative specifier would otherwise resolve to the anchor directory, opening a second directory-source route.
  it.each(['./content', '../sibling', '/srv/content'])(
    'rejects "%s" as a filesystem path, not a package name',
    (name) => expect(locatePackage(name, { baseDir: '/srv/app', contentKeyPath })).rejects.toThrow(/filesystem path/),
  );
});
