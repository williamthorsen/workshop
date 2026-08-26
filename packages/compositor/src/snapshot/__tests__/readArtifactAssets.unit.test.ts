import { Buffer } from 'node:buffer';

import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { describe, expect, it } from 'vitest';

import { readArtifactAssets } from '../readArtifactAssets.ts';

// A PNG signature stands in for an asset no UTF-8 reading survives.
const diagramBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe(readArtifactAssets, () => {
  it('reads every file beside the entry file, at the path each deploys under', async () => {
    using tree = createTempTree({
      'SKILL.md': '# Review\n',
      'checklist.md': '# Checklist\n',
      'assets/diagram.svg': '<svg />\n',
    });

    const assets = await readArtifactAssets(tree.dir, 'SKILL.md');

    expect(assets.map(({ relativePath }) => relativePath)).toStrictEqual(['assets/diagram.svg', 'checklist.md']);
  });

  it('excludes the entry file however the layout spells its path, the name arriving as a consumer declared it', async () => {
    using tree = createTempTree({ 'SKILL.md': '# Review\n', 'checklist.md': '# Checklist\n' });

    const assets = await readArtifactAssets(tree.dir, './SKILL.md');

    expect(assets.map(({ relativePath }) => relativePath)).toStrictEqual(['checklist.md']);
  });

  it('reads an artifact shipping nothing else as shipping no asset', async () => {
    using tree = createTempTree({ 'SKILL.md': '# Review\n' });

    await expect(readArtifactAssets(tree.dir, 'SKILL.md')).resolves.toStrictEqual([]);
  });

  it('passes over tool state, matching the digest the artifact is identified by', async () => {
    using tree = createTempTree({ 'SKILL.md': '# Review\n', '.cache/build.json': '{}' });

    await expect(readArtifactAssets(tree.dir, 'SKILL.md')).resolves.toStrictEqual([]);
  });

  it('ships an underscore-prefixed directory, support content standing beside artifacts being a rule about a kind’s root', async () => {
    using tree = createTempTree({ 'SKILL.md': '# Review\n', '_data/table.md': '# Table\n' });

    const assets = await readArtifactAssets(tree.dir, 'SKILL.md');

    expect(assets.map(({ relativePath }) => relativePath)).toStrictEqual(['_data/table.md']);
  });

  it('copies an asset no UTF-8 reading survives byte for byte', async () => {
    using tree = createTempTree({ 'SKILL.md': '# Review\n', 'diagram.png': diagramBytes });

    const [asset] = await readArtifactAssets(tree.dir, 'SKILL.md');

    expect(asset?.body.encoding).toBe('base64');
    expect(Buffer.from(asset?.body.data ?? '', 'base64').equals(Buffer.from(diagramBytes))).toBe(true);
  });

  it('hashes each asset over its own bytes, so a rebuilt asset moves', async () => {
    using before = createTempTree({ 'SKILL.md': '# Review\n', 'checklist.md': '# Checklist\n' });
    using after = createTempTree({ 'SKILL.md': '# Review\n', 'checklist.md': '# Checklist v2\n' });

    const [first] = await readArtifactAssets(before.dir, 'SKILL.md');
    const [second] = await readArtifactAssets(after.dir, 'SKILL.md');

    expect(second?.hash).not.toBe(first?.hash);
  });
});
