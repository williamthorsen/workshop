import { rm } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { StaleSnapshotError } from '../../config/StaleSnapshotError.ts';
import { PlanSchema } from '../../schemas/plan-schemas.ts';
import type { RenderTarget } from '../../schemas/render-target-schemas.ts';
import { buildConfig } from '../../test-utils/buildConfig.ts';
import { assertPlanIsConsistent } from '../assertPlanIsConsistent.ts';
import { composePlan } from '../composePlan.ts';
import { captureComposition } from '../../test-utils/captureComposition.ts';
import { buildClaudeTarget, buildOverlappingTargets, HOST_PATH } from '../../test-utils/composition-fixture.ts';

describe(composePlan, () => {
  it('composes a plan the schema accepts', async () => {
    const { config, snapshot } = await captureComposition();

    expect(() => PlanSchema.parse(composePlan(config, snapshot))).not.toThrow();
  });

  it('composes a plan that does not contradict itself', async () => {
    const { config, snapshot } = await captureComposition();

    expect(() => assertPlanIsConsistent(composePlan(config, snapshot))).not.toThrow();
  });

  it('holds every invariant over a plan carrying a removal and a block', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: { 'skills/lint/SKILL.md': '<!-- include: ./gone.md /-->\n', 'rulebooks/naming.md': 'Name.\n' },
      targetFiles: { 'skills/lint/SKILL.md': '# Old lint\n', 'skills/retired/SKILL.md': '# Retired\n' },
    });
    const plan = composePlan(config, snapshot);

    expect(plan.files.map(({ path, status }) => [path, status])).toContainEqual(['skills/retired/SKILL.md', 'removed']);
    expect(() => PlanSchema.parse(plan)).not.toThrow();
    expect(() => assertPlanIsConsistent(plan)).not.toThrow();
  });

  it('composes deep-equal plans from identical inputs', async () => {
    const { config, snapshot } = await captureComposition();

    expect(composePlan(config, snapshot)).toStrictEqual(composePlan(config, snapshot));
  });

  it('composes after the workspace is deleted, no filesystem reaching the flow', async () => {
    const { config, snapshot, sourceDir, targetRoot } = await captureComposition();
    const before = composePlan(config, snapshot);

    await rm(sourceDir, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });

    expect(composePlan(config, snapshot)).toStrictEqual(before);
  });

  it('plans a config edited in memory without touching disk, which is the whole of what-if', async () => {
    const { config, snapshot, sourceDir, targetRoot } = await captureComposition();
    await rm(sourceDir, { recursive: true, force: true });
    await rm(targetRoot, { recursive: true, force: true });

    const edited = { ...config, tiers: config.tiers.map((tier) => ({ ...tier, select: [] })) };
    const plan = composePlan(edited, snapshot);

    expect(plan.artifacts).toStrictEqual([]);
    expect(plan.files).toStrictEqual([]);
  });

  it('records the engine version the snapshot was captured by, never one read at compose time', async () => {
    const { config, snapshot } = await captureComposition();

    expect(composePlan(config, snapshot).engineVersion).toBe(snapshot.engineVersion);
  });

  it('claims complete content, every body it names having been registered as it was computed', async () => {
    const { config, snapshot } = await captureComposition();
    const plan = composePlan(config, snapshot);
    const named = plan.files.flatMap(({ current, planned }) => [current?.hash, planned?.hash]);
    const carried = new Set(Object.keys(plan.blobs));

    expect(plan.contentAvailability).toBe('complete');
    expect(named.filter((hash) => hash !== undefined).every((hash) => carried.has(hash))).toBe(true);
  });

  it('runs every id-keyed table lexicographically', async () => {
    const { config, snapshot } = await captureComposition();
    const plan = composePlan(config, snapshot);

    for (const table of [plan.artifacts, plan.kinds, plan.partials, plan.targets, plan.tokenKinds]) {
      expect(table.map(({ id }) => id)).toStrictEqual(table.map(({ id }) => id).toSorted());
    }
  });

  it('runs sources in precedence order and tiers in fold order, where a position is the meaning', async () => {
    const { config, snapshot } = await captureComposition();
    const plan = composePlan(config, snapshot);

    expect(plan.sources.map(({ id }) => id)).toStrictEqual(snapshot.catalog.sources.map(({ id }) => id));
    expect(plan.tiers.map(({ id }) => id)).toStrictEqual(config.tiers.map(({ id }) => id));
  });

  it('runs files by target and then by path', async () => {
    const { config, snapshot } = await captureComposition();
    const plan = composePlan(config, snapshot);
    const keys = plan.files.map(({ targetId, path }) => `${targetId} ${path}`);

    expect(keys).toStrictEqual(keys.toSorted());
  });

  it('keys blobs in hash order, so two plans of one shape diff cleanly', async () => {
    const { config, snapshot } = await captureComposition();
    const hashes = Object.keys(composePlan(config, snapshot).blobs);

    expect(hashes).toStrictEqual(hashes.toSorted());
  });

  it('carries the target as an entry alone, its pipeline and deployments being engine input', async () => {
    const { config, snapshot } = await captureComposition();

    expect(composePlan(config, snapshot).targets).toStrictEqual([
      {
        id: 'claude',
        label: 'Claude',
        root: snapshot.targets[0]?.root,
        tokenMappings: [],
        containerDirs: ['skills'],
      },
    ]);
  });

  it('names a tree deployment’s layout root once per target, however many kinds share it', async () => {
    const { config, snapshot } = await captureComposition({ buildTargets: buildOverlappingTargets });

    expect(composePlan(config, snapshot).targets[0]?.containerDirs).toStrictEqual(['skills']);
  });

  it('names no container directory for a target that only routes into a region host', async () => {
    const { config, snapshot } = await captureComposition({
      buildTargets: (targetRoot) => [buildRegionOnlyTarget(targetRoot)],
    });

    expect(composePlan(config, snapshot).targets[0]?.containerDirs).toStrictEqual([]);
  });

  it('names each region host contributor on the file they aggregate into', async () => {
    const { config, snapshot } = await captureComposition();
    const host = composePlan(config, snapshot).files.find(({ path }) => path === HOST_PATH);

    expect(host?.contributors.artifacts).toStrictEqual([
      {
        artifactId: 'rulebook:naming',
        marker: { open: '<!-- rulebook:naming -->', close: '<!-- /rulebook:naming -->' },
      },
      {
        artifactId: 'rulebook:style',
        marker: { open: '<!-- rulebook:style -->', close: '<!-- /rulebook:style -->' },
      },
    ]);
  });

  it('carries no body no file names, a discarded destination taking its bodies with it', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: {
        'rulebooks/naming.md': 'Name things well.\n',
        'skills/consult-naming/SKILL.md': '# Consult naming\n',
      },
      buildTargets: buildOverlappingTargets,
      targetFiles: { 'skills/consult-naming/SKILL.md': '# Held\n' },
    });
    const plan = composePlan(config, snapshot);
    const named = new Set(plan.files.flatMap(({ current, planned }) => [current?.hash, planned?.hash]));

    expect(Object.keys(plan.blobs).filter((hash) => !named.has(hash))).toStrictEqual([]);
  });

  it('leaves a contested destination’s contenders at the status their own content earned', async () => {
    const { config, snapshot } = await captureComposition({
      sourceFiles: {
        'rulebooks/naming.md': 'Name things well.\n',
        'skills/consult-naming/SKILL.md': '# Consult naming\n',
      },
      buildTargets: buildOverlappingTargets,
      targetFiles: { 'skills/consult-naming/SKILL.md': '# Held\n' },
    });
    const plan = composePlan(config, snapshot);

    expect(plan.artifacts.map(({ id, status }) => [id, status])).toStrictEqual([
      ['rulebook:naming', 'changed'],
      ['skill:consult-naming', 'changed'],
    ]);
    expect(plan.files.map(({ path, status }) => [path, status])).toStrictEqual([
      ['skills/consult-naming/SKILL.md', 'unchanged'],
    ]);
  });

  it('refuses a config whose adopted sources have moved away from the snapshot', async () => {
    const { snapshot } = await captureComposition();
    const remapped = buildConfig([{ id: 'project', sources: { use: [{ name: 'team', path: '/srv/elsewhere' }] } }]);

    expect(() => composePlan(remapped, snapshot)).toThrow(StaleSnapshotError);
  });

  it('refuses a snapshot captured without the target state a diff is measured against', async () => {
    const { config, snapshot } = await captureComposition({ input: { shouldReadTargetState: false } });

    expect(() => composePlan(config, snapshot)).toThrow(StaleSnapshotError);
  });
});

// region | Helpers

/** Builds a target routing its one deployed kind into a region host, so no tree layout root stands beneath it. */
function buildRegionOnlyTarget(targetRoot: string): RenderTarget {
  const claude = buildClaudeTarget(targetRoot);

  return { ...claude, deployments: claude.deployments.filter((deployment) => deployment.form === 'region') };
}

// endregion | Helpers
