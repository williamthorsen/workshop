import { describe, expect, it } from 'vitest';

import { resolveInclusionPaths } from '../../graph/traversal.ts';
import { assertPlanIsConsistent } from '../../plan/assertPlanIsConsistent.ts';
import type { FileEntry } from '../../schemas/file-schemas.ts';
import type { ArtifactEntry } from '../../schemas/graph-schemas.ts';
import { PlanSchema } from '../../schemas/plan-schema.ts';
import { buildRepresentativeSample } from '../buildRepresentativeSample.ts';
import { buildSampleDocuments } from '../sample-documents.ts';

const documents = buildSampleDocuments().map((document) => [document.fileName, document] as const);
const representative = buildRepresentativeSample();

describe('published samples', () => {
  it.each(documents)('%s validates against the plan schema', (_fileName, { plan }) => {
    expect(PlanSchema.parse(plan)).toStrictEqual(plan);
  });

  it.each(documents)('%s satisfies every consistency invariant', (_fileName, { plan }) => {
    expect(() => {
      assertPlanIsConsistent(plan);
    }).not.toThrow();
  });
});

describe(buildRepresentativeSample, () => {
  it('reaches one artifact by three routes, two of them from the same seed', () => {
    expect(resolveInclusionPaths(representative, 'skill:lint')).toStrictEqual([
      ['collection:core', 'skill:review', 'skill:lint'],
      ['collection:core', 'skill:lint'],
      ['subagent:auditor', 'skill:review', 'skill:lint'],
    ]);
  });

  it('records two losing candidates for an artifact three sources carry', () => {
    expect(findArtifact('skill:review').resolution?.shadowed.map((candidate) => candidate.sourceId)).toStrictEqual([
      'packaged',
      'library',
    ]);
  });

  it('lets the lowest-precedence source win where no other source carries the artifact', () => {
    expect(findArtifact('skill:lint').resolution?.winner.sourceId).toBe('library');
  });

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

  it('owns individual entries within a structured config', () => {
    expect(findFile('settings.json').ownership).toStrictEqual({
      kind: 'entries',
      sentinel: 'codeassembly',
      format: 'json',
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
    const blob = asset.planned === undefined ? undefined : representative.blobs[asset.planned.hash];

    expect(blob?.encoding).toBe('base64');
  });

  it('records a file apply will skip, with the reason beside its diff', () => {
    const skipped = findFile('subagents/auditor.md');

    expect(skipped.blocked?.reason).toBe('the destination is owned by another tool');
    expect(skipped.status).toBe('changed');
  });

  it('exhibits every diff status across its files', () => {
    expect(new Set(representative.files.map((file) => file.status))).toStrictEqual(
      new Set(['added', 'changed', 'removed', 'unchanged']),
    );
  });

  it('carries an artifact that is no longer part of the closure', () => {
    expect(findArtifact('skill:retired').status).toBe('removed');
  });
});

// region | Helpers

/** The representative sample's artifact with the given id, failing the test when it carries none. */
function findArtifact(id: string): ArtifactEntry {
  const artifact = representative.artifacts.find((entry) => entry.id === id);
  if (artifact === undefined) {
    throw new Error(`The representative sample carries no artifact "${id}".`);
  }
  return artifact;
}

/** The representative sample's file at the given path, failing the test when it carries none. */
function findFile(filePath: string): FileEntry {
  const file = representative.files.find((entry) => entry.path === filePath);
  if (file === undefined) {
    throw new Error(`The representative sample carries no file "${filePath}".`);
  }
  return file;
}

/** The sentinel `file` declares for the entries it owns, failing the test when it is not entry-owned. */
function readEntriesSentinel(file: FileEntry): string {
  if (file.ownership.kind !== 'entries') {
    throw new Error(`The sample file "${file.path}" does not declare entry ownership.`);
  }
  return file.ownership.sentinel;
}

/** The body the representative sample plans to write for `file`, failing the test when it carries none. */
function readPlannedBody(file: FileEntry): string {
  const blob = file.planned === undefined ? undefined : representative.blobs[file.planned.hash];
  if (blob === undefined) {
    throw new Error(`The representative sample carries no planned body for "${file.path}".`);
  }
  return blob.data;
}

// endregion | Helpers
