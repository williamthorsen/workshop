import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { isRecord } from '../../portable/is-record.ts';
import { archiveTake, digestFile, type TakeArchivePlan } from '../archive-take.ts';

const RENDERED_AT = new Date('2026-11-01T03:04:05.000Z');

const TAKE_PATH = 'archive/demos/quickstart/20261101-030405Z_abc1234';

const FULL_OUTPUT = {
  'repo/demos/quickstart/output/final-demo.mp4': 'video bytes',
  'repo/demos/quickstart/output/final-demo.srt': 'srt',
  'repo/demos/quickstart/output/final-demo.vtt': 'vtt',
  'repo/demos/quickstart/output/report.json': '{}',
  'repo/demos/quickstart/output/poster.png': 'not archived',
};

describe(archiveTake, () => {
  it('archives the video, the captions, the report, and a provenance record', async () => {
    using tree = createTempTree(FULL_OUTPUT);

    const outcome = await archiveTake(createPlan(tree));

    expect(outcome).toStrictEqual({ ok: true, takeDir: tree.resolve(TAKE_PATH) });
    expect(readdirSync(tree.resolve(TAKE_PATH)).toSorted()).toStrictEqual([
      'final-demo.mp4',
      'final-demo.srt',
      'final-demo.vtt',
      'provenance.json',
      'report.json',
    ]);
    expect(readProvenance(tree)).toMatchObject({
      demo: 'quickstart',
      label: 'demos',
      source: { commit: 'abc1234def', dirty: false },
      files: { 'final-demo.mp4': { bytes: 11, sha256: sha256('video bytes') } },
    });
  });

  it('records checksums that match both the archived and the rendered files', async () => {
    using tree = createTempTree(FULL_OUTPUT);

    await archiveTake(createPlan(tree));

    const { files } = readProvenance(tree);
    for (const [name, digest] of Object.entries(files)) {
      await expect(digestFile(tree.resolve(TAKE_PATH, name))).resolves.toStrictEqual(digest);
      await expect(digestFile(tree.resolve('repo/demos/quickstart/output', name))).resolves.toStrictEqual(digest);
    }
  });

  it('omits caption files that the render did not write', async () => {
    using tree = createTempTree({ 'repo/demos/quickstart/output/final-demo.mp4': 'video bytes' });

    await archiveTake(createPlan(tree));

    expect(Object.keys(readProvenance(tree).files)).toStrictEqual(['final-demo.mp4']);
  });

  it('fails without a video and leaves the archive untouched', async () => {
    using tree = createTempTree({ 'repo/demos/quickstart/output/report.json': '{}' });

    const outcome = await archiveTake(createPlan(tree));

    expect(outcome).toStrictEqual({
      ok: false,
      message: `${tree.resolve('repo/demos/quickstart/output/final-demo.mp4')} not found`,
    });
    expect(tree.exists('archive')).toBe(false);
  });

  it('refuses to overwrite an existing take', async () => {
    using tree = createTempTree({ ...FULL_OUTPUT, [`${TAKE_PATH}/keep.txt`]: 'earlier take' });

    const outcome = await archiveTake(createPlan(tree));

    expect(outcome).toStrictEqual({ ok: false, message: `${tree.resolve(TAKE_PATH)} already exists` });
    expect(readdirSync(tree.resolve(TAKE_PATH))).toStrictEqual(['keep.txt']);
  });

  it('removes the staging directory when a copy fails', async () => {
    // A directory where a file is expected makes the copy fail after staging begins.
    using tree = createTempTree({
      'repo/demos/quickstart/output/final-demo.mp4': 'video bytes',
      'repo/demos/quickstart/output/report.json/nested.txt': 'x',
    });

    const outcome = await archiveTake(createPlan(tree));

    expect(outcome.ok).toBe(false);
    expect(readdirSync(tree.resolve('archive/demos/quickstart'))).toStrictEqual([]);
  });
});

// region | Helpers

/** Builds a plan that archives the tree's `quickstart` take under the tree's `archive/`. */
function createPlan(tree: TempTree): TakeArchivePlan {
  return {
    aidemoVersion: '0.20.0',
    archiveRoot: tree.resolve('archive'),
    demo: 'quickstart',
    demoDir: tree.resolve('repo/demos/quickstart'),
    label: 'demos',
    params: [],
    renderedAt: RENDERED_AT,
    source: { commit: 'abc1234def', dirty: false },
    storyboardSha256: 's',
    voice: { provider: 'openai', voiceId: 'marin' },
  };
}

/** Reads the archived take's provenance record. */
function readProvenance(tree: TempTree): { files: Record<string, unknown> } & Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path.join(tree.resolve(TAKE_PATH), 'provenance.json'), 'utf8'));
  if (!isRecord(parsed) || !isRecord(parsed['files'])) throw new Error('unexpected provenance record');

  return { ...parsed, files: parsed['files'] };
}

/** Returns the sha256 of a string, as hex. */
function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// endregion | Helpers
