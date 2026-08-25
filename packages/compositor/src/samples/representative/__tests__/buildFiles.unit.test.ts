import { describe, expect, it } from 'vitest';

import { createBlobStore } from '../../../portable/createBlobStore.ts';
import type { FileEntry } from '../../../schemas/file-schemas.ts';
import { buildFiles } from '../buildFiles.ts';

const blobs = createBlobStore();
const files = buildFiles(blobs);
const bodies = blobs.toTable();

describe(buildFiles, () => {
  it('aggregates three artifacts into one region, each behind its own marker', () => {
    const aggregated = findFile('CLAUDE.md');

    expect(aggregated.ownership).toStrictEqual({
      kind: 'region',
      open: '<!-- ambient:start -->',
      close: '<!-- ambient:end -->',
    });
    expect(aggregated.contributors.artifacts).toHaveLength(3);
    expect(aggregated.contributors.artifacts.every((contribution) => contribution.marker !== undefined)).toBe(true);
  });

  it('names no contributor on an entries host, nothing artifact-shaped reaching one', () => {
    expect(findFile('settings.json').contributors).toStrictEqual({ artifacts: [], partials: [] });
  });

  it('owns individual entries within a structured config', () => {
    expect(findFile('settings.json').ownership).toStrictEqual({
      kind: 'entries',
      format: 'json',
      collections: [{ path: ['hooks'], sentinel: { path: ['source'], value: 'codeassembly' } }],
    });
  });

  it('marks each owned entry with the sentinel it declares, beside an item it must not touch', () => {
    const config = findFile('settings.json');
    const sentinel = readEntriesSentinel(config);
    const parsed: { hooks: Array<{ command: string; source?: string }> } = JSON.parse(readPlannedBody(config));

    expect(parsed.hooks.filter((hook) => hook.source === sentinel)).toHaveLength(2);
    expect(parsed.hooks.filter((hook) => hook.source === undefined)).toHaveLength(1);
  });

  it('carries a byte-encoded body for an asset copied verbatim', () => {
    const asset = findFile('skills/review/diagram.png');
    const blob = asset.planned === undefined ? undefined : bodies[asset.planned.hash];

    expect(blob?.encoding).toBe('base64');
  });

  it('records a file apply will skip, with the reason beside its diff', () => {
    const skipped = findFile('subagents/auditor.md');

    expect(skipped.blocked?.reason).toBe('the destination is owned by another tool');
    expect(skipped.status).toBe('changed');
  });

  it('exhibits every diff status across its files', () => {
    expect(new Set(files.map((file) => file.status))).toStrictEqual(
      new Set(['added', 'changed', 'removed', 'unchanged']),
    );
  });
});

// region | Helpers

/** Finds the file at the given path, failing the test when the table carries none. */
function findFile(filePath: string): FileEntry {
  const file = files.find((entry) => entry.path === filePath);
  if (file === undefined) {
    throw new Error(`The representative sample carries no file "${filePath}".`);
  }
  return file;
}

/** Reads the sentinel value `file` declares for the entries it owns, failing the test when it is not entry-owned. */
function readEntriesSentinel(file: FileEntry): string {
  if (file.ownership.kind !== 'entries') {
    throw new Error(`The sample file "${file.path}" does not declare entry ownership.`);
  }
  const [owned] = file.ownership.collections;
  if (owned === undefined) {
    throw new Error(`The sample file "${file.path}" declares entry ownership over no collection.`);
  }
  return owned.sentinel.value;
}

/** Reads the body planned for `file`, failing the test when the store carries none. */
function readPlannedBody(file: FileEntry): string {
  const blob = file.planned === undefined ? undefined : bodies[file.planned.hash];
  if (blob === undefined) {
    throw new Error(`The representative sample carries no planned body for "${file.path}".`);
  }
  return blob.data;
}

// endregion | Helpers
