import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { RenderTargetConsistencyError } from '../../render/assertRenderTargetsAreConsistent.ts';
import type { ArtifactRender } from '../../render/renderArtifact.ts';
import type { ResolveKind } from '../../schemas/catalog-schemas.ts';
import type { RenderTarget } from '../../schemas/render-target-schemas.ts';
import { buildCompositionInput, captureComposition } from '../../test-utils/captureComposition.ts';
import { buildCompositionSourceFiles, COMPOSITION_KINDS } from '../../test-utils/composition-fixture.ts';
import { readManifestVersion } from '../../test-utils/readManifestVersion.ts';
import { captureSnapshot, type CaptureSnapshotInput, type CompositionSnapshot } from '../captureSnapshot.ts';

describe(captureSnapshot, () => {
  it('contains every artifact the sources hold, whatever any config selects', async () => {
    const { snapshot } = await captureComposition();

    expect(snapshot.catalog.entries.map(({ id }) => id)).toStrictEqual([
      'collection:core',
      'rulebook:naming',
      'rulebook:style',
      'skill:lint',
      'skill:review',
      'subagent:auditor',
    ]);
  });

  it('names the sources it was captured over, which is what bounds how far an edited config may travel', async () => {
    const { snapshot } = await captureComposition();

    expect(snapshot.resolution.sources.map(({ name }) => name)).toStrictEqual(['team']);
  });

  it('renders each artifact the target deploys', async () => {
    const { snapshot } = await captureComposition();

    expect(renderOf(snapshot, 'skill:review')).toMatchObject({ status: 'rendered', content: '# Review\n' });
  });

  it('records a render that could not resolve a directive as data', async () => {
    const { snapshot } = await captureComposition({
      sourceFiles: { ...buildCompositionSourceFiles(), 'skills/broken/SKILL.md': '<!-- include: ./missing.md /-->\n' },
    });

    expect(renderOf(snapshot, 'skill:broken')).toMatchObject({
      status: 'failed',
      failure: {
        stage: 'transclusion',
        diagnostic: { code: 'not-found', at: { path: 'skills/broken/SKILL.md', line: 1 } },
      },
    });
  });

  it('renders undefined for a kind the target declares no deployment for', async () => {
    const { snapshot } = await captureComposition();

    expect(renderOf(snapshot, 'subagent:auditor')).toBeUndefined();
  });

  it('renders undefined for a kind that emits no files', async () => {
    const { snapshot } = await captureComposition();

    expect(renderOf(snapshot, 'collection:core')).toBeUndefined();
  });

  it('reads the files a directory-shaped artifact ships beside its entry file', async () => {
    const { snapshot } = await captureComposition();

    expect(snapshot.assets.get('skill:review')?.map(({ relativePath }) => relativePath)).toStrictEqual(['diagram.png']);
  });

  it('holds no assets for an artifact shipping none, an absent key and an empty list meaning one thing', async () => {
    const { snapshot } = await captureComposition();

    expect(snapshot.assets.has('rulebook:naming')).toBe(false);
  });

  it('reads an artifact’s whole tree where its entry file sits below the artifact’s own root', async () => {
    const nested: ResolveKind = {
      id: 'skill',
      label: 'Skill',
      emitsFiles: true,
      layout: { form: 'directory', root: 'skills', entryFile: 'docs/SKILL.md' },
    };
    const { snapshot } = await captureComposition({
      sourceFiles: { 'skills/review/checklist.md': '# Checklist\n', 'skills/review/docs/SKILL.md': '# Review\n' },
      input: { kinds: COMPOSITION_KINDS.map((kind) => (kind.id === 'skill' ? nested : kind)) },
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
    const { snapshot } = await captureComposition({
      sourceFiles: {
        'collections/everything/COLLECTION.md': '# Everything\n',
        'collections/everything/notes.md': '# Notes\n',
      },
      input: { kinds: COMPOSITION_KINDS.map((kind) => (kind.id === 'collection' ? shaped : kind)) },
    });

    expect(snapshot.assets.has('collection:everything')).toBe(false);
  });

  it('digests each source over its whole directory', async () => {
    const { snapshot } = await captureComposition();

    expect(snapshot.sourceDigests.map(({ sourceId }) => sourceId)).toStrictEqual(['team']);
    expect(snapshot.sourceDigests[0]?.digest).toMatch(/^sha256:/);
  });

  it('reads what each target currently holds', async () => {
    const { snapshot } = await captureComposition({ targetFiles: { 'skills/review/SKILL.md': '# Old review\n' } });

    expect(
      snapshot.targetState?.[0]?.claimed.map(({ path, claims }) => [path, claims.map(({ id }) => id)]),
    ).toStrictEqual([['skills/review/SKILL.md', ['skill:review']]]);
  });

  it('skips the destination scan where the caller has no deployment to plan', async () => {
    const { snapshot } = await captureComposition({ input: { shouldReadTargetState: false } });

    expect(snapshot.targetState).toBeUndefined();
  });

  it('records the engine version, so a plan names what produced it', async () => {
    const { snapshot } = await captureComposition();

    expect(snapshot.engineVersion).toBe(await readManifestVersion());
  });

  it('reads an unchanged workspace to the same digests twice, which is what a fingerprint rests on', async () => {
    using sourceTree = createTempTree(buildCompositionSourceFiles(), { prefix: 'compositor-source-' });
    using targetTree = createTempTree({ 'skills/review/SKILL.md': '# Old review\n' }, { prefix: 'compositor-target-' });

    const first = await captureSnapshot(buildCompositionInput(sourceTree.dir, targetTree.dir));
    const second = await captureSnapshot(buildCompositionInput(sourceTree.dir, targetTree.dir));

    expect(second.sourceDigests).toStrictEqual(first.sourceDigests);
    expect(second.targetState?.map(({ digest }) => digest)).toStrictEqual(
      first.targetState?.map(({ digest }) => digest),
    );
  });

  it('refuses a target declaration before reading anything', async () => {
    const input = buildCompositionInput('/nonexistent/source', '/nonexistent/target');
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
