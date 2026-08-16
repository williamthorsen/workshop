import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { disposeOnTestFinished } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it } from 'vitest';

import { RenderTargetConsistencyError } from '../../render/assertRenderTargetsAreConsistent.ts';
import type { ArtifactRender } from '../../render/renderArtifact.ts';
import type { ResolveKind } from '../../schemas/catalog-schemas.ts';
import type { RenderTarget } from '../../schemas/render-target-schemas.ts';
import { buildConfig } from '../../test-utils/buildConfig.ts';
import { readManifestVersion } from '../../test-utils/readManifestVersion.ts';
import type { CaptureSnapshotInput, CompositionSnapshot } from '../captureSnapshot.ts';
import { captureSnapshot } from '../captureSnapshot.ts';

// A PNG signature stands in for a skill asset the engine copies byte for byte.
const diagramBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const sourceFiles = {
  'collections/everything.md': '# Everything\n',
  'rulebooks/shell.md': 'Use long-form options.\n',
  'skills/broken/SKILL.md': '<!-- include: ./missing.md /-->\n',
  'skills/review/SKILL.md': '# Review\n',
  'skills/review/diagram.png': diagramBytes,
  'subagents/auditor.md': '# Auditor\n',
};

const kinds: ReadonlyArray<ResolveKind> = [
  {
    id: 'collection',
    label: 'Collection',
    emitsFiles: false,
    layout: { form: 'file', root: 'collections', extension: '.md' },
  },
  {
    id: 'rulebook',
    label: 'Rulebook',
    emitsFiles: true,
    layout: { form: 'file', root: 'rulebooks', extension: '.md' },
  },
  {
    id: 'skill',
    label: 'Skill',
    emitsFiles: true,
    layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
  },
  {
    id: 'subagent',
    label: 'Subagent',
    emitsFiles: true,
    layout: { form: 'file', root: 'subagents', extension: '.md' },
  },
];

describe(captureSnapshot, () => {
  it('carries every artifact the sources hold, whatever any config selects', async () => {
    const snapshot = await capture();

    expect(snapshot.catalog.entries.map(({ id }) => id)).toStrictEqual([
      'collection:everything',
      'rulebook:shell',
      'skill:broken',
      'skill:review',
      'subagent:auditor',
    ]);
  });

  it('names the sources it was captured over, which is what bounds how far an edited config may travel', async () => {
    const snapshot = await capture();

    expect(snapshot.resolution.sources.map(({ name }) => name)).toStrictEqual(['team']);
  });

  it('renders each artifact the target deploys', async () => {
    const snapshot = await capture();

    expect(renderOf(snapshot, 'skill:review')).toMatchObject({ status: 'rendered', content: '# Review\n' });
  });

  it('carries a render that could not resolve a directive as data', async () => {
    const snapshot = await capture();

    expect(renderOf(snapshot, 'skill:broken')).toMatchObject({
      status: 'failed',
      diagnostic: { code: 'not-found', at: { path: 'skills/broken/SKILL.md', line: 1 } },
    });
  });

  it('renders nothing for a kind the target declares no deployment for', async () => {
    const snapshot = await capture();

    expect(renderOf(snapshot, 'subagent:auditor')).toBeUndefined();
  });

  it('renders nothing for a kind that emits no files', async () => {
    const snapshot = await capture();

    expect(renderOf(snapshot, 'collection:everything')).toBeUndefined();
  });

  it('reads the files a directory-shaped artifact ships beside its entry file', async () => {
    const snapshot = await capture();

    expect(snapshot.assets.get('skill:review')?.map(({ relativePath }) => relativePath)).toStrictEqual(['diagram.png']);
  });

  it('holds no assets for an artifact shipping none, an absent key and an empty list meaning one thing', async () => {
    const snapshot = await capture();

    expect(snapshot.assets.has('rulebook:shell')).toBe(false);
  });

  it('reads an artifact’s whole tree where its entry file sits below the artifact’s own root', async () => {
    const nested: ResolveKind = {
      id: 'skill',
      label: 'Skill',
      emitsFiles: true,
      layout: { form: 'directory', root: 'skills', entryFile: 'docs/SKILL.md' },
    };
    const snapshot = await capture({
      sourceFiles: { 'skills/review/checklist.md': '# Checklist\n', 'skills/review/docs/SKILL.md': '# Review\n' },
      input: { kinds: kinds.map((kind) => (kind.id === 'skill' ? nested : kind)) },
    });

    expect(snapshot.assets.get('skill:review')?.map(({ relativePath }) => relativePath)).toStrictEqual([
      'checklist.md',
    ]);
  });

  it('reads no files for a kind that emits none, no target being able to write one out', async () => {
    const shaped: ResolveKind = {
      id: 'collection',
      label: 'Collection',
      emitsFiles: false,
      layout: { form: 'directory', root: 'collections', entryFile: 'COLLECTION.md' },
    };
    const snapshot = await capture({
      sourceFiles: {
        'collections/everything/COLLECTION.md': '# Everything\n',
        'collections/everything/notes.md': '# Notes\n',
      },
      input: { kinds: kinds.map((kind) => (kind.id === 'collection' ? shaped : kind)) },
    });

    expect(snapshot.assets.has('collection:everything')).toBe(false);
  });

  it('digests each source over its whole directory', async () => {
    const snapshot = await capture();

    expect(snapshot.sourceDigests.map(({ sourceId }) => sourceId)).toStrictEqual(['team']);
    expect(snapshot.sourceDigests[0]?.digest).toMatch(/^sha256:/);
  });

  it('reads what each target currently holds', async () => {
    const snapshot = await capture({ targetFiles: { 'skills/review/SKILL.md': '# Old review\n' } });

    expect(
      snapshot.targetState?.[0]?.claimed.map(({ path, claims }) => [path, claims.map(({ id }) => id)]),
    ).toStrictEqual([['skills/review/SKILL.md', ['skill:review']]]);
  });

  it('skips the destination scan where the caller has no deployment to plan', async () => {
    const snapshot = await capture({ input: { shouldReadTargetState: false } });

    expect(snapshot.targetState).toBeUndefined();
  });

  it('records the engine version, so a plan names what produced it', async () => {
    const snapshot = await capture();

    expect(snapshot.engineVersion).toBe(await readManifestVersion());
  });

  it('reads an unchanged workspace to the same digests twice, which is what a fingerprint rests on', async () => {
    using sourceTree = createTempTree(sourceFiles, { prefix: 'compositor-source-' });
    using targetTree = createTempTree({ 'skills/review/SKILL.md': '# Old review\n' }, { prefix: 'compositor-target-' });

    const first = await captureSnapshot(buildInput(sourceTree.dir, targetTree.dir));
    const second = await captureSnapshot(buildInput(sourceTree.dir, targetTree.dir));

    expect(second.sourceDigests).toStrictEqual(first.sourceDigests);
    expect(second.targetState?.map(({ digest }) => digest)).toStrictEqual(
      first.targetState?.map(({ digest }) => digest),
    );
  });

  it('refuses a target declaration before reading anything', async () => {
    const sourceDir = '/nonexistent/source';
    const input = buildInput(sourceDir, '/nonexistent/target');
    const targets: ReadonlyArray<RenderTarget> = [
      {
        ...requireTarget(input),
        deployments: [{ form: 'tree', kindId: 'unknown', layout: { form: 'file', root: '', extension: '.md' } }],
      },
    ];

    await expect(captureSnapshot({ ...input, targets })).rejects.toThrow(RenderTargetConsistencyError);
  });
});

// region | Helpers

/** Captures a snapshot over a temporary source tree and target root, overriding parts of the input a test varies. */
async function capture(
  options: {
    sourceFiles?: Record<string, string | Uint8Array>;
    targetFiles?: Record<string, string>;
    input?: Partial<CaptureSnapshotInput>;
  } = {},
): Promise<CompositionSnapshot> {
  const files = options.sourceFiles ?? sourceFiles;
  const { dir: sourceDir } = disposeOnTestFinished(createTempTree(files, { prefix: 'compositor-source-' }));
  const targetFiles = options.targetFiles ?? { '.keep': '' };
  const { dir: targetRoot } = disposeOnTestFinished(createTempTree(targetFiles, { prefix: 'compositor-target-' }));

  return captureSnapshot({ ...buildInput(sourceDir, targetRoot), ...options.input });
}

/** Builds the input a capture over `sourceDir` and `targetRoot` reads. */
function buildInput(sourceDir: string, targetRoot: string): CaptureSnapshotInput {
  const target: RenderTarget = {
    id: 'claude',
    label: 'Claude',
    root: targetRoot,
    tokenMappings: [],
    deployments: [
      { form: 'tree', kindId: 'skill', layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' } },
      {
        form: 'region',
        kindId: 'rulebook',
        host: 'CLAUDE.md',
        markers: { open: '<!-- codeassembly -->', close: '<!-- /codeassembly -->' },
        contributionMarkers: { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' },
      },
    ],
    stages: [{ kind: 'transclusion', syntax: { open: '<!--', close: '-->' } }],
  };

  return {
    config: buildConfig([{ id: 'project', sources: { use: [{ name: 'team', path: sourceDir }] } }]),
    baseDir: targetRoot,
    kinds,
    targets: [target],
    tokenKinds: [],
    edgeRules: [],
    kindKeys: {},
    contentKeyPath: ['compositor', 'content'],
  };
}

/** Reads what one artifact rendered to for the sole target a fixture declares. */
function renderOf(snapshot: CompositionSnapshot, artifactId: string): ArtifactRender | undefined {
  return snapshot.renders.get('claude')?.get(artifactId);
}

/** Reads the sole target out of an input, so a test can vary one of its fields. */
function requireTarget(input: CaptureSnapshotInput): RenderTarget {
  const [target] = input.targets;
  if (target === undefined) {
    throw new Error('The fixture declares one target.');
  }
  return target;
}

// endregion | Helpers
