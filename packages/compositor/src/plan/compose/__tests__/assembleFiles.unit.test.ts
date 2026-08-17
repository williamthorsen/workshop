import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import { computeClosure } from '../../../closure/computeClosure.ts';
import type { BlobStore } from '../../../portable/createBlobStore.ts';
import { createBlobStore } from '../../../portable/createBlobStore.ts';
import type { Blob, FileEntry } from '../../../schemas/file-schemas.ts';
import { selectArtifacts } from '../../../selection/selectArtifacts.ts';
import type { CaptureCompositionOptions } from '../../../test-utils/captureComposition.ts';
import { captureComposition } from '../../../test-utils/captureComposition.ts';
import {
  buildClaudeTarget,
  buildCompositionSourceFiles,
  buildInlayingTarget,
  buildOverlappingTargets,
  COMPOSITION_KINDS,
  HOST_PATH,
  REGION_MARKERS,
} from '../../../test-utils/composition-fixture.ts';
import type { FileAssembly } from '../assembleFiles.ts';
import { assembleFiles } from '../assembleFiles.ts';
import { assertSnapshotFits } from '../assertSnapshotFits.ts';

const brokenSkill = { ...buildCompositionSourceFiles(), 'skills/review/SKILL.md': '<!-- include: ./gone.md /-->\n' };

describe(assembleFiles, () => {
  it('plans every destination a target does not yet hold as added', async () => {
    const { assembly } = await assemble();

    expect(assembly.files.map(({ path, status }) => [path, status])).toStrictEqual([
      ['CLAUDE.md', 'added'],
      ['skills/lint/SKILL.md', 'added'],
      ['skills/review/SKILL.md', 'added'],
      ['skills/review/diagram.png', 'added'],
    ]);
  });

  it('carries an asset byte for byte, no target transforming what an artifact ships alongside', async () => {
    const { assembly, blobs } = await assemble();

    expect(bodyOf(blobs, assembly, 'skills/review/diagram.png')).toStrictEqual({
      encoding: 'base64',
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64'),
    });
  });

  it('aggregates every routed artifact into the host region, in artifact-id order', async () => {
    const { assembly, blobs } = await assemble();
    const host = bodyOf(blobs, assembly, HOST_PATH);

    expect(host.data).toBe(
      [
        REGION_MARKERS.open,
        '<!-- rulebook:naming -->',
        'Name things well.',
        '<!-- /rulebook:naming -->',
        '',
        '<!-- rulebook:style -->',
        'Write plainly.',
        '<!-- /rulebook:style -->',
        REGION_MARKERS.close,
        '',
      ].join('\n'),
    );
  });

  it('reads a destination holding exactly what is planned as unchanged, keeping a re-plan quiet', async () => {
    const first = await assemble();
    const second = await assemble({ targetFiles: writeBack(first) });

    expect(second.assembly.files.map(({ path, status }) => [path, status])).toStrictEqual([
      ['CLAUDE.md', 'unchanged'],
      ['skills/lint/SKILL.md', 'unchanged'],
      ['skills/review/SKILL.md', 'unchanged'],
      ['skills/review/diagram.png', 'unchanged'],
    ]);
  });

  it('reads a destination holding something else as changed', async () => {
    const first = await assemble();
    const stale = { ...writeBack(first), 'skills/lint/SKILL.md': '# Stale lint\n' };
    const { assembly } = await assemble({ targetFiles: stale });

    expect(statusOf(assembly, 'skills/lint/SKILL.md')).toBe('changed');
  });

  it('plans the removal of a destination nothing routes to any more', async () => {
    const { assembly } = await assemble({ targetFiles: { 'skills/retired/SKILL.md': '# Retired\n' } });
    const removed = fileAt(assembly, 'skills/retired/SKILL.md');

    expect(removed.status).toBe('removed');
    expect(removed.planned).toBeUndefined();
    expect(removed.contributors.artifacts).toStrictEqual([{ artifactId: 'skill:retired' }]);
  });

  it('records the artifact departing with a removed destination, kind and slug included', async () => {
    const { assembly } = await assemble({ targetFiles: { 'skills/retired/SKILL.md': '# Retired\n' } });

    expect(assembly.departed).toStrictEqual([{ id: 'skill:retired', kindId: 'skill', slug: 'retired' }]);
  });

  it('blocks a destination whose content could not be rendered at the content it holds', async () => {
    const { assembly } = await assemble({
      sourceFiles: brokenSkill,
      targetFiles: { 'skills/review/SKILL.md': '# Old review\n' },
    });
    const blocked = fileAt(assembly, 'skills/review/SKILL.md');

    expect(blocked.status).toBe('unchanged');
    expect(blocked.current).toStrictEqual(blocked.planned);
    expect(blocked.blocked?.reason).toMatch(/could not be rendered/);
  });

  it('plans no destination for a render that failed where the target holds nothing', async () => {
    const { assembly } = await assemble({ sourceFiles: brokenSkill });

    expect(assembly.files.map(({ path }) => path)).not.toContain('skills/review/SKILL.md');
  });

  it('blocks the assets of an artifact whose entry file could not be rendered, never half-deploying one', async () => {
    const { assembly } = await assemble({
      sourceFiles: brokenSkill,
      targetFiles: { 'skills/review/SKILL.md': '# Old review\n', 'skills/review/diagram.png': 'stale' },
    });

    expect(fileAt(assembly, 'skills/review/diagram.png').blocked?.reason).toMatch(/could not be rendered/);
  });

  it('leaves a destination it could not render unswept, a broken directive proposing no deletion', async () => {
    const { assembly } = await assemble({
      sourceFiles: brokenSkill,
      targetFiles: { 'skills/review/SKILL.md': '# Old review\n' },
    });

    expect(statusOf(assembly, 'skills/review/SKILL.md')).not.toBe('removed');
  });

  it('blocks a host whose markers are damaged, which is a fact about the destination', async () => {
    const damaged = `${REGION_MARKERS.open}\nstray\n${REGION_MARKERS.open}\nheld\n${REGION_MARKERS.close}\n`;
    const { assembly } = await assemble({ targetFiles: { [HOST_PATH]: damaged } });
    const host = fileAt(assembly, HOST_PATH);

    expect(host.status).toBe('unchanged');
    expect(host.blocked?.reason).toMatch(/open marker/);
  });

  it('blocks the whole host where one contributor could not be rendered', async () => {
    const broken = { ...buildCompositionSourceFiles(), 'rulebooks/naming.md': '<!-- include: ./gone.md /-->\n' };
    const first = await assemble();
    const { assembly } = await assemble({ sourceFiles: broken, targetFiles: writeBack(first) });

    expect(fileAt(assembly, HOST_PATH).blocked?.reason).toMatch(/"rulebook:naming" could not be rendered/);
  });

  it('plans a host holding a region that nothing routes to any more without one', async () => {
    const first = await assemble();
    const { assembly, blobs } = await assemble({ select: {}, targetFiles: writeBack(first) });

    expect(statusOf(assembly, HOST_PATH)).toBe('changed');
    expect(bodyOf(blobs, assembly, HOST_PATH).data).not.toContain(REGION_MARKERS.open);
  });

  it('plans no host at all where the engine has neither content there nor a region to take away', async () => {
    const { assembly } = await assemble({ select: {}, targetFiles: { [HOST_PATH]: '# Mine\n' } });

    expect(assembly.files.map(({ path }) => path)).not.toContain(HOST_PATH);
  });

  it('judges a region contributor by its own block, so a sibling’s edit does not move it', async () => {
    const first = await assemble();
    const edited = { ...buildCompositionSourceFiles(), 'rulebooks/style.md': 'Write very plainly.\n' };
    const { assembly } = await assemble({ sourceFiles: edited, targetFiles: writeBack(first) });

    expect(assembly.verdicts.get('rulebook:naming')).toStrictEqual(['unchanged']);
    expect(assembly.verdicts.get('rulebook:style')).toStrictEqual(['changed']);
  });

  it('records the artifact departing with a contribution the host still carries', async () => {
    const first = await assemble();
    const { assembly } = await assemble({
      select: { rulebook: { use: ['naming'] }, skill: { use: [{ source: 'team' }] } },
      targetFiles: writeBack(first),
    });

    expect(assembly.departed).toStrictEqual([{ id: 'rulebook:style', kindId: 'rulebook', slug: 'style' }]);
  });

  it('blocks a path two deployments both claim, its provenance being undecidable from shape', async () => {
    const { assembly } = await assemble({
      buildTargets: buildOverlappingTargets,
      targetFiles: { 'skills/consult-naming/SKILL.md': '# Naming\n' },
    });
    const ambiguous = fileAt(assembly, 'skills/consult-naming/SKILL.md');

    expect(ambiguous.blocked?.reason).toMatch(/undecidable from shape/);
    expect(ambiguous.contributors.artifacts).toStrictEqual([{ artifactId: 'rulebook:naming' }]);
  });

  it('places no asset for a region-routed kind, whose artifacts contribute a body rather than a tree', async () => {
    const kinds = COMPOSITION_KINDS.map((kind) =>
      kind.id === 'rulebook'
        ? { ...kind, layout: { form: 'directory' as const, root: 'rulebooks', entryFile: 'RULEBOOK.md' } }
        : kind,
    );
    const { assembly } = await assemble({
      sourceFiles: { 'rulebooks/naming/RULEBOOK.md': 'Name things well.\n', 'rulebooks/naming/notes.md': '# Notes\n' },
      input: { kinds },
    });

    expect(assembly.files.map(({ path }) => path)).toStrictEqual([HOST_PATH]);
  });

  it('blocks a destination two deployments both write, naming each artifact that wanted it', async () => {
    const { assembly } = await assemble({
      sourceFiles: {
        'rulebooks/naming.md': 'Name things well.\n',
        'skills/consult-naming/SKILL.md': '# Consult naming\n',
      },
      buildTargets: buildOverlappingTargets,
      targetFiles: { 'skills/consult-naming/SKILL.md': '# Held\n' },
    });
    const contested = fileAt(assembly, 'skills/consult-naming/SKILL.md');

    expect(assembly.files.filter(({ path }) => path === 'skills/consult-naming/SKILL.md')).toHaveLength(1);
    expect(contested.status).toBe('unchanged');
    expect(contested.blocked?.reason).toMatch(/"rulebook:naming", "skill:consult-naming".*undecidable/);
  });

  it('plans no contested destination at all where the target holds nothing there', async () => {
    const { assembly } = await assemble({
      sourceFiles: {
        'rulebooks/naming.md': 'Name things well.\n',
        'skills/consult-naming/SKILL.md': '# Consult naming\n',
      },
      buildTargets: buildOverlappingTargets,
    });

    expect(assembly.files.map(({ path }) => path)).not.toContain('skills/consult-naming/SKILL.md');
  });

  it('places no asset under a deployment laid out one file per artifact, which holds one file', async () => {
    const { assembly } = await assemble({
      buildTargets: (targetRoot) => [
        {
          ...buildClaudeTarget(targetRoot),
          deployments: [{ form: 'tree', kindId: 'skill', layout: { form: 'file', root: 'skills', extension: '.md' } }],
        },
      ],
    });

    expect(assembly.files.map(({ path }) => path)).toStrictEqual(['skills/lint.md', 'skills/review.md']);
  });

  it('registers no body for a host it plans no file for, keeping a reader’s own file out of the table', async () => {
    const { assembly, blobs } = await assemble({
      select: {},
      targetFiles: { [HOST_PATH]: '# My own guidance.\n' },
    });

    expect(assembly.files).toStrictEqual([]);
    expect(blobs.toTable()).toStrictEqual({});
  });

  it('splices a bound artifact into the inlay a tree-deployed body declared', async () => {
    const { assembly, blobs } = await assemble({
      sourceFiles: {
        'rulebooks/naming.md': 'Name things well.\n',
        'skills/review/SKILL.md': '# Review\n\n<!-- inlay: preferences -->\n',
      },
      inlays: { preferences: { rulebook: { use: ['naming'] } } },
      buildTargets: (targetRoot) => [buildInlayingTarget(targetRoot)],
    });

    expect(bodyOf(blobs, assembly, 'skills/review/SKILL.md').data).toBe(
      [
        '# Review',
        '',
        '<!-- inlay:preferences:start -->',
        '<!-- fill:rulebook:naming -->',
        'Name things well.',
        '<!-- /fill:rulebook:naming -->',
        '<!-- inlay:preferences:end -->',
        '',
      ].join('\n'),
    );
  });

  it('names a bound artifact among the contributors of the file it filled', async () => {
    const { assembly } = await assemble({
      sourceFiles: {
        'rulebooks/naming.md': 'Name things well.\n',
        'skills/review/SKILL.md': '# Review\n<!-- inlay: preferences -->\n',
      },
      inlays: { preferences: { rulebook: { use: ['naming'] } } },
      buildTargets: (targetRoot) => [buildInlayingTarget(targetRoot)],
    });

    expect(fileAt(assembly, 'skills/review/SKILL.md').contributors.artifacts).toStrictEqual([
      { artifactId: 'skill:review' },
      {
        artifactId: 'rulebook:naming',
        marker: { open: '<!-- fill:rulebook:naming -->', close: '<!-- /fill:rulebook:naming -->' },
      },
    ]);
  });

  it('splices a bound artifact inside the block a routed contributor occupies in its host', async () => {
    const { assembly, blobs } = await assemble({
      sourceFiles: {
        'rulebooks/naming.md': 'Name things well.\n<!-- inlay: extras -->\n',
        'skills/lint/SKILL.md': '# Lint\n',
      },
      inlays: { extras: { skill: { use: ['lint'] } } },
      buildTargets: (targetRoot) => [buildInlayingTarget(targetRoot)],
    });

    const host = bodyOf(blobs, assembly, HOST_PATH);

    expect(host.data).toBe(
      [
        REGION_MARKERS.open,
        '<!-- rulebook:naming -->',
        'Name things well.',
        '<!-- inlay:extras:start -->',
        '<!-- fill:skill:lint -->',
        '# Lint',
        '<!-- /fill:skill:lint -->',
        '<!-- inlay:extras:end -->',
        '<!-- /rulebook:naming -->',
        REGION_MARKERS.close,
        '',
      ].join('\n'),
    );
    expect(fileAt(assembly, HOST_PATH).contributors.artifacts.map(({ artifactId }) => artifactId)).toStrictEqual([
      'rulebook:naming',
      'skill:lint',
    ]);
  });

  it('blocks the file whose inlay a nesting filler could not fill, at the content it holds, and nothing besides', async () => {
    const { assembly } = await assemble({
      sourceFiles: {
        'rulebooks/naming.md': 'Naming.\n<!-- inlay: deeper -->\n',
        'skills/lint/SKILL.md': '# Lint\n',
        'skills/review/SKILL.md': '# Review\n<!-- inlay: preferences -->\n',
      },
      targetFiles: { 'skills/review/SKILL.md': '# Old review\n' },
      inlays: { preferences: { rulebook: { use: ['naming'] } } },
      buildTargets: (targetRoot) => [buildInlayingTarget(targetRoot)],
    });

    expect(fileAt(assembly, 'skills/review/SKILL.md').blocked?.reason).toContain(
      '"rulebook:naming" declares an inlay of its own',
    );
    expect(fileAt(assembly, 'skills/lint/SKILL.md')).toHaveProperty('status', 'added');
  });

  it('gives an artifact deploying nowhere no verdict, nothing recording where it previously stood', async () => {
    const { assembly } = await assemble();

    expect(assembly.verdicts.has('collection:core')).toBe(false);
  });
});

// region | Helpers

/** Assembles the files a composition over a temporary workspace plans, with the store holding every body. */
async function assemble(options?: CaptureCompositionOptions): Promise<{ assembly: FileAssembly; blobs: BlobStore }> {
  const { config, snapshot } = await captureComposition(options);
  assertSnapshotFits(config, snapshot);

  const selection = selectArtifacts(config, snapshot.catalog);
  const closure = computeClosure({
    graph: snapshot.edgeGraph,
    selection,
    tiers: config.tiers.map(({ id, label }) => ({ id, label })),
  });
  const blobs = createBlobStore();

  const assembly = assembleFiles({ snapshot, artifacts: closure.artifacts, blobs, bindings: selection.bindings });

  return { assembly, blobs };
}

/** Reads the body planned for one destination out of the store. */
function bodyOf(blobs: BlobStore, assembly: FileAssembly, path: string): Blob {
  const hash = fileAt(assembly, path).planned?.hash;
  const blob = hash === undefined ? undefined : blobs.toTable()[hash];
  if (blob === undefined) {
    throw new Error(`The assembly plans no body for "${path}".`);
  }
  return blob;
}

/** Reads one destination's entry, failing where the assembly plans none. */
function fileAt(assembly: FileAssembly, path: string): FileEntry {
  const file = assembly.files.find((entry) => entry.path === path);
  if (file === undefined) {
    throw new Error(`The assembly plans no file at "${path}".`);
  }
  return file;
}

/** Reads one destination's status. */
function statusOf(assembly: FileAssembly, path: string): string | undefined {
  return assembly.files.find((entry) => entry.path === path)?.status;
}

/** Renders an assembly's planned bodies as the target tree a later capture reads, which is what applying it would. */
function writeBack({
  assembly,
  blobs,
}: {
  assembly: FileAssembly;
  blobs: BlobStore;
}): Record<string, string | Uint8Array> {
  const table = blobs.toTable();
  const written: Record<string, string | Uint8Array> = {};

  for (const file of assembly.files) {
    const blob = file.planned === undefined ? undefined : table[file.planned.hash];
    if (blob !== undefined) {
      written[file.path] = blob.encoding === 'utf8' ? blob.data : Buffer.from(blob.data, 'base64');
    }
  }

  return written;
}

// endregion | Helpers
