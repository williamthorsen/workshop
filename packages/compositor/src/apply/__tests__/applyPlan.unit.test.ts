import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { describe, expect, it } from 'vitest';

import { composePlan } from '../../plan/composePlan.ts';
import { hashUtf8 } from '../../portable/hash-content.ts';
import { readDirNames } from '../../portable/readDirNames.ts';
import { statIfPresent } from '../../portable/statIfPresent.ts';
import type { Blob, FileEntry } from '../../schemas/file-schemas.ts';
import type { OwnedItemsDeclaration } from '../../schemas/owned-items-schemas.ts';
import type { Plan } from '../../schemas/plan-schemas.ts';
import type { RenderTarget } from '../../schemas/render-target-schemas.ts';
import type { Hash } from '../../schemas/scalar-schemas.ts';
import { buildPlan } from '../../test-utils/buildPlan.ts';
import { captureComposition } from '../../test-utils/captureComposition.ts';
import { buildClaudeTarget } from '../../test-utils/composition-fixture.ts';
import { applyPlan } from '../applyPlan.ts';
import { UnapplicablePlanError } from '../UnapplicablePlanError.ts';

const LINT_SKILL = 'skills/lint/SKILL.md';
const PLANNED_BODY = '# Review\n\nUpdated.\n';
const PLANNED_HASH = hashUtf8(PLANNED_BODY);

describe(applyPlan, () => {
  it('writes every planned destination', async () => {
    const { config, snapshot, targetRoot } = await captureComposition();

    const outcome = await applyPlan(composePlan(config, snapshot), { baseDir: targetRoot });

    expect(outcome.files.map(({ action }) => action)).toStrictEqual(outcome.files.map(() => 'written'));
    await expect(readFile(path.join(targetRoot, LINT_SKILL), 'utf8')).resolves.toBe('# Lint\n');
  });

  it('finds nothing to do the second time, the destination already holding what was planned', async () => {
    const { config, snapshot, targetRoot } = await captureComposition();
    const plan = composePlan(config, snapshot);

    await applyPlan(plan, { baseDir: targetRoot });
    const second = await applyPlan(plan, { baseDir: targetRoot });

    expect(second.files.map(({ action }) => action)).toStrictEqual(second.files.map(() => 'unchanged'));
    await expect(readFile(path.join(targetRoot, LINT_SKILL), 'utf8')).resolves.toBe('# Lint\n');
  });

  it('applies a plan carrying no file without touching the destination', async () => {
    const { config, snapshot, targetRoot } = await captureComposition({ select: {} });
    const before = await readDirNames(targetRoot);

    const outcome = await applyPlan(composePlan(config, snapshot), { baseDir: targetRoot });

    expect(outcome.files).toStrictEqual([]);
    expect(outcome.prunedDirs).toStrictEqual([]);
    await expect(readDirNames(targetRoot)).resolves.toStrictEqual(before);
  });

  it('carries the plan’s fingerprint, so a persisted outcome names what it applied', async () => {
    const { config, snapshot, targetRoot } = await captureComposition();
    const plan = composePlan(config, snapshot);

    expect((await applyPlan(plan, { baseDir: targetRoot })).fingerprint).toStrictEqual(plan.fingerprint);
  });

  it('passes over a destination that moved after the plan was composed', async () => {
    const { config, snapshot, targetRoot } = await captureComposition();
    const plan = composePlan(config, snapshot);
    await applyPlan(plan, { baseDir: targetRoot });
    await writeFile(path.join(targetRoot, LINT_SKILL), '# Edited by hand\n');

    const outcome = await applyPlan(plan, { baseDir: targetRoot });

    expect(findAction(outcome.files, LINT_SKILL)).toBe('skipped-drifted');
    await expect(readFile(path.join(targetRoot, LINT_SKILL), 'utf8')).resolves.toBe('# Edited by hand\n');
  });

  it('writes over a destination that moved when forced', async () => {
    const { config, snapshot, targetRoot } = await captureComposition();
    const plan = composePlan(config, snapshot);
    await applyPlan(plan, { baseDir: targetRoot });
    await writeFile(path.join(targetRoot, LINT_SKILL), '# Edited by hand\n');

    const outcome = await applyPlan(plan, { baseDir: targetRoot, force: true });

    expect(findAction(outcome.files, LINT_SKILL)).toBe('written');
    await expect(readFile(path.join(targetRoot, LINT_SKILL), 'utf8')).resolves.toBe('# Lint\n');
  });

  it('reads a destination the plan calls unchanged, so one that moved since reports as drift', async () => {
    const { config, snapshot, targetRoot } = await captureComposition({
      targetFiles: { [LINT_SKILL]: '# Lint\n' },
    });
    const plan = composePlan(config, snapshot);
    await writeFile(path.join(targetRoot, LINT_SKILL), '# Edited by hand\n');

    const outcome = await applyPlan(plan, { baseDir: targetRoot });

    expect(plan.files.find(({ path: filePath }) => filePath === LINT_SKILL)?.status).toBe('unchanged');
    expect(findAction(outcome.files, LINT_SKILL)).toBe('skipped-drifted');
  });

  it('removes what nothing plans and prunes the directory it empties, leaving the layout root', async () => {
    const { config, snapshot, targetRoot } = await captureComposition({
      sourceFiles: { 'rulebooks/naming.md': 'Name things well.\n' },
      targetFiles: { 'skills/retired/SKILL.md': '# Retired\n', 'skills/retired/diagram.svg': '<svg/>\n' },
    });

    const outcome = await applyPlan(composePlan(config, snapshot), { baseDir: targetRoot });

    expect(
      outcome.files.filter(({ action }) => action === 'removed').map(({ path: filePath }) => filePath),
    ).toStrictEqual(['skills/retired/SKILL.md', 'skills/retired/diagram.svg']);
    expect(outcome.prunedDirs).toStrictEqual([{ targetId: 'claude', path: 'skills/retired' }]);
    await expect(statIfPresent(path.join(targetRoot, 'skills'))).resolves.toBeDefined();
    await expect(statIfPresent(path.join(targetRoot, 'skills/retired'))).resolves.toBeUndefined();
  });

  it('passes over a removal whose destination moved, leaving the file where it is', async () => {
    const { config, snapshot, targetRoot } = await captureComposition({
      sourceFiles: { 'rulebooks/naming.md': 'Name things well.\n' },
      targetFiles: { 'skills/retired/SKILL.md': '# Retired\n' },
    });
    const plan = composePlan(config, snapshot);
    await writeFile(path.join(targetRoot, 'skills/retired/SKILL.md'), '# Edited by hand\n');

    const outcome = await applyPlan(plan, { baseDir: targetRoot });

    expect(findAction(outcome.files, 'skills/retired/SKILL.md')).toBe('skipped-drifted');
    expect(outcome.prunedDirs).toStrictEqual([]);
    await expect(statIfPresent(path.join(targetRoot, 'skills/retired'))).resolves.toBeDefined();
  });

  it('finds the removal already done the second time, taking no directory a second time either', async () => {
    const { config, snapshot, targetRoot } = await captureComposition({
      sourceFiles: { 'rulebooks/naming.md': 'Name things well.\n' },
      targetFiles: { 'skills/retired/SKILL.md': '# Retired\n' },
    });
    const plan = composePlan(config, snapshot);

    await applyPlan(plan, { baseDir: targetRoot });
    const second = await applyPlan(plan, { baseDir: targetRoot });

    expect(second.files.map(({ action }) => action)).toStrictEqual(second.files.map(() => 'unchanged'));
    expect(second.prunedDirs).toStrictEqual([]);
    await expect(statIfPresent(path.join(targetRoot, 'skills'))).resolves.toBeDefined();
  });

  it('removes a destination that moved when forced', async () => {
    const { config, snapshot, targetRoot } = await captureComposition({
      sourceFiles: { 'rulebooks/naming.md': 'Name things well.\n' },
      targetFiles: { 'skills/retired/SKILL.md': '# Retired\n' },
    });
    const plan = composePlan(config, snapshot);
    await writeFile(path.join(targetRoot, 'skills/retired/SKILL.md'), '# Edited by hand\n');

    const outcome = await applyPlan(plan, { baseDir: targetRoot, force: true });

    expect(findAction(outcome.files, 'skills/retired/SKILL.md')).toBe('removed');
    expect(outcome.prunedDirs).toStrictEqual([{ targetId: 'claude', path: 'skills/retired' }]);
    await expect(statIfPresent(path.join(targetRoot, 'skills/retired'))).resolves.toBeUndefined();
  });

  it('decides every action in a dry run and writes none of them', async () => {
    const { config, snapshot, targetRoot } = await captureComposition({
      sourceFiles: { 'rulebooks/naming.md': 'Name things well.\n', 'skills/lint/SKILL.md': '# Lint\n' },
      targetFiles: { [LINT_SKILL]: '# Lint\n', 'skills/retired/SKILL.md': '# Retired\n' },
    });
    const plan = composePlan(config, snapshot);

    const dry = await applyPlan(plan, { baseDir: targetRoot, dryRun: true });
    const untouched = await statIfPresent(path.join(targetRoot, 'skills/retired/SKILL.md'));
    const real = await applyPlan(plan, { baseDir: targetRoot });

    expect(dry.dryRun).toBe(true);
    expect(dry.files.map(({ action }) => action).toSorted()).toStrictEqual(['removed', 'unchanged', 'written']);
    expect(dry.prunedDirs).toStrictEqual([{ targetId: 'claude', path: 'skills/retired' }]);
    expect(dry.files).toStrictEqual(real.files);
    expect(dry.prunedDirs).toStrictEqual(real.prunedDirs);
    expect(untouched).toBeDefined();
  });

  it('leaves every directory standing for a target naming none of its own, which an older plan states', async () => {
    const { config, snapshot, targetRoot } = await captureComposition({
      sourceFiles: { 'rulebooks/naming.md': 'Name things well.\n' },
      targetFiles: { 'skills/retired/SKILL.md': '# Retired\n' },
    });
    const composed = composePlan(config, snapshot);
    const plan = { ...composed, targets: composed.targets.map(({ containerDirs, ...target }) => target) };

    const outcome = await applyPlan(plan, { baseDir: targetRoot });

    expect(findAction(outcome.files, 'skills/retired/SKILL.md')).toBe('removed');
    expect(outcome.prunedDirs).toStrictEqual([]);
    await expect(statIfPresent(path.join(targetRoot, 'skills/retired'))).resolves.toBeDefined();
  });

  it('keeps a directory it empties and writes into, in a dry run as in the run itself', async () => {
    using targetRoot = createTempTree({ 'skills/foo/SKILL.md': '# Foo\n' }, { prefix: 'compositor-target-' });
    const plan = buildPlan();
    const emptied: Plan = {
      ...plan,
      targets: [{ id: 'claude', label: 'Claude', root: targetRoot.dir, tokenMappings: [], containerDirs: ['skills'] }],
      files: [
        {
          targetId: 'claude',
          path: 'skills/foo/SKILL.md',
          status: 'removed',
          ownership: { kind: 'full' },
          current: { hash: hashUtf8('# Foo\n') },
          contributors: { artifacts: [{ artifactId: 'skill:review' }], partials: [] },
        },
        {
          targetId: 'claude',
          path: 'skills/foo/AGENT.md',
          status: 'added',
          ownership: { kind: 'full' },
          planned: { hash: PLANNED_HASH },
          contributors: { artifacts: [{ artifactId: 'skill:review' }], partials: [] },
        },
      ],
      blobs: { [PLANNED_HASH]: { encoding: 'utf8', data: PLANNED_BODY } },
    };

    const dry = await applyPlan(emptied, { baseDir: targetRoot.dir, dryRun: true });
    const real = await applyPlan(emptied, { baseDir: targetRoot.dir });

    expect(dry.prunedDirs).toStrictEqual([]);
    expect(dry.prunedDirs).toStrictEqual(real.prunedDirs);
    await expect(statIfPresent(path.join(targetRoot.dir, 'skills/foo/AGENT.md'))).resolves.toBeDefined();
  });

  it('passes over a blocked destination, which no force overrides', async () => {
    using targetRoot = createTempTree({ [LINT_SKILL]: '# Lint\n' }, { prefix: 'compositor-target-' });
    const plan = buildSingleFilePlan(targetRoot.dir, {
      targetId: 'claude',
      path: LINT_SKILL,
      status: 'changed',
      ownership: { kind: 'full' },
      blocked: { reason: 'The destination’s provenance is undecidable from shape.' },
      current: { hash: hashUtf8('# Lint\n') },
      planned: { hash: PLANNED_HASH },
      contributors: { artifacts: [{ artifactId: 'skill:review' }], partials: [] },
    });

    const outcome = await applyPlan(plan, { baseDir: targetRoot.dir, force: true });

    expect(outcome.files.map(({ action, reason }) => [action, reason])).toStrictEqual([
      ['skipped-blocked', 'The destination’s provenance is undecidable from shape.'],
    ]);
    await expect(readFile(path.join(targetRoot.dir, LINT_SKILL), 'utf8')).resolves.toBe('# Lint\n');
  });

  it('passes over a destination the plan recorded a body for that holds nothing', async () => {
    using targetRoot = createTempTree({ '.keep': '' }, { prefix: 'compositor-target-' });
    const plan = buildSingleFilePlan(targetRoot.dir, {
      targetId: 'claude',
      path: LINT_SKILL,
      status: 'changed',
      ownership: { kind: 'full' },
      current: { hash: hashUtf8('# Lint\n') },
      planned: { hash: PLANNED_HASH },
      contributors: { artifacts: [{ artifactId: 'skill:review' }], partials: [] },
    });

    const outcome = await applyPlan(plan, { baseDir: targetRoot.dir });

    expect(outcome.files.map(({ action }) => action)).toStrictEqual(['skipped-drifted']);
    await expect(statIfPresent(path.join(targetRoot.dir, LINT_SKILL))).resolves.toBeUndefined();
  });

  it('writes a body no UTF-8 round trip survives byte for byte', async () => {
    const { config, snapshot, targetRoot } = await captureComposition();

    await applyPlan(composePlan(config, snapshot), { baseDir: targetRoot });

    expect(new Uint8Array(await readFile(path.join(targetRoot, 'skills/review/diagram.png')))).toStrictEqual(
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it('refuses a plan that does not carry every body it would write', async () => {
    using targetRoot = createTempTree({ '.keep': '' }, { prefix: 'compositor-target-' });
    const plan = { ...buildPlan(), contentAvailability: 'partial' as const };

    await expect(applyPlan(plan, { baseDir: targetRoot.dir })).rejects.toThrow(UnapplicablePlanError);
  });

  it('refuses a plan naming a body its blobs do not hold', async () => {
    using targetRoot = createTempTree({ '.keep': '' }, { prefix: 'compositor-target-' });
    const plan = buildSingleFilePlan(
      targetRoot.dir,
      {
        targetId: 'claude',
        path: LINT_SKILL,
        status: 'added',
        ownership: { kind: 'full' },
        planned: { hash: 'sha256:absent' },
        contributors: { artifacts: [{ artifactId: 'skill:review' }], partials: [] },
      },
      {},
    );

    await expect(applyPlan(plan, { baseDir: targetRoot.dir })).rejects.toThrow(/blobs do not hold/);
  });

  it('refuses a plan whose file names a target it does not carry', async () => {
    using targetRoot = createTempTree({ '.keep': '' }, { prefix: 'compositor-target-' });
    const plan = buildSingleFilePlan(targetRoot.dir, {
      targetId: 'rovodev',
      path: LINT_SKILL,
      status: 'added',
      ownership: { kind: 'full' },
      planned: { hash: PLANNED_HASH },
      contributors: { artifacts: [{ artifactId: 'skill:review' }], partials: [] },
    });

    await expect(applyPlan(plan, { baseDir: targetRoot.dir })).rejects.toThrow(/no root resolves for it/);
  });

  it.each([
    ['a path climbing out of the target', '../../.ssh/config'],
    ['an absolute path', '/etc/hosts'],
  ])('refuses %s, leaving what stands outside the target alone', async (_label, escaping) => {
    using targetRoot = createTempTree({ '.keep': '' }, { prefix: 'compositor-target-' });
    const plan = buildSingleFilePlan(targetRoot.dir, {
      targetId: 'claude',
      path: escaping,
      status: 'added',
      ownership: { kind: 'full' },
      planned: { hash: PLANNED_HASH },
      contributors: { artifacts: [{ artifactId: 'skill:review' }], partials: [] },
    });

    await expect(applyPlan(plan, { baseDir: targetRoot.dir })).rejects.toThrow(/inside the target's root/);
  });

  describe('an entries host', () => {
    it('is written whole, the plan carrying the host with the engine’s items already spliced in', async () => {
      using targetRoot = createTempTree({ 'settings.json': HELD_SETTINGS }, { prefix: 'compositor-target-' });
      const plan = buildEntriesPlan(targetRoot.dir, HELD_SETTINGS, PLANNED_SETTINGS);

      const outcome = await applyPlan(plan, { baseDir: targetRoot.dir });

      expect(outcome.files).toStrictEqual([
        { targetId: 'claude', path: 'settings.json', action: 'written', hash: hashUtf8(PLANNED_SETTINGS) },
      ]);
      await expect(readFile(path.join(targetRoot.dir, 'settings.json'), 'utf8')).resolves.toBe(PLANNED_SETTINGS);
    });

    it('is left alone by a second apply, the destination already holding the planned body', async () => {
      using targetRoot = createTempTree({ 'settings.json': HELD_SETTINGS }, { prefix: 'compositor-target-' });
      const plan = buildEntriesPlan(targetRoot.dir, HELD_SETTINGS, PLANNED_SETTINGS);

      await applyPlan(plan, { baseDir: targetRoot.dir });
      const second = await applyPlan(plan, { baseDir: targetRoot.dir });

      expect(second.files.map(({ action }) => action)).toStrictEqual(['unchanged']);
    });

    it('is passed over when the host moved after the plan was composed', async () => {
      using targetRoot = createTempTree({ 'settings.json': '{ "hooks": [] }\n' }, { prefix: 'compositor-target-' });
      const plan = buildEntriesPlan(targetRoot.dir, HELD_SETTINGS, PLANNED_SETTINGS);

      const outcome = await applyPlan(plan, { baseDir: targetRoot.dir });

      expect(outcome.files.map(({ action }) => action)).toStrictEqual(['skipped-drifted']);
      await expect(readFile(path.join(targetRoot.dir, 'settings.json'), 'utf8')).resolves.toBe('{ "hooks": [] }\n');
    });

    it('is written over drift under force, which the caller asked for', async () => {
      using targetRoot = createTempTree({ 'settings.json': '{ "hooks": [] }\n' }, { prefix: 'compositor-target-' });
      const plan = buildEntriesPlan(targetRoot.dir, HELD_SETTINGS, PLANNED_SETTINGS);

      const outcome = await applyPlan(plan, { baseDir: targetRoot.dir, force: true });

      expect(outcome.files.map(({ action }) => action)).toStrictEqual(['written']);
    });

    it('composes and applies beside a region host, each destination carrying its own ownership kind', async () => {
      const { config, snapshot, targetRoot } = await captureComposition({
        targetFiles: { 'settings.json': HELD_SETTINGS },
        buildTargets: buildOwningTarget,
      });
      const plan = composePlan(config, snapshot);

      const outcome = await applyPlan(plan, { baseDir: targetRoot });

      expect(kindAt(plan, 'CLAUDE.md')).toBe('region');
      expect(kindAt(plan, 'settings.json')).toBe('entries');
      expect(outcome.files.map(({ action }) => action)).toStrictEqual(outcome.files.map(() => 'written'));

      const second = await applyPlan(plan, { baseDir: targetRoot });
      expect(second.files.map(({ action }) => action)).toStrictEqual(second.files.map(() => 'unchanged'));
    });

    it('withdraws its items when the declaration is toggled off, leaving the foreign one alone', async () => {
      const applied = await captureComposition({
        targetFiles: { 'settings.json': HELD_SETTINGS },
        buildTargets: buildOwningTarget,
      });
      await applyPlan(composePlan(applied.config, applied.snapshot), { baseDir: applied.targetRoot });

      const withdrawn = await captureComposition({
        targetFiles: { 'settings.json': await readFile(path.join(applied.targetRoot, 'settings.json'), 'utf8') },
        buildTargets: (root) => [{ ...buildClaudeTarget(root), ownedItems: [{ ...settingsHooks, items: [] }] }],
      });
      await applyPlan(composePlan(withdrawn.config, withdrawn.snapshot), { baseDir: withdrawn.targetRoot });

      const left: unknown = JSON.parse(await readFile(path.join(withdrawn.targetRoot, 'settings.json'), 'utf8'));
      expect(left).toStrictEqual({ hooks: [{ command: 'vendor-tool sync' }] });
    });

    it('decides the same action under dryRun and writes nothing', async () => {
      using targetRoot = createTempTree({ 'settings.json': HELD_SETTINGS }, { prefix: 'compositor-target-' });
      const plan = buildEntriesPlan(targetRoot.dir, HELD_SETTINGS, PLANNED_SETTINGS);

      const outcome = await applyPlan(plan, { baseDir: targetRoot.dir, dryRun: true });

      expect(outcome.files.map(({ action }) => action)).toStrictEqual(['written']);
      await expect(readFile(path.join(targetRoot.dir, 'settings.json'), 'utf8')).resolves.toBe(HELD_SETTINGS);
    });
  });
});

// region | Helpers

/** What a host holds before the engine's items reach it: one foreign hook, compactly written. */
const HELD_SETTINGS = '{\n  "hooks": [\n    { "command": "vendor-tool sync" }\n  ]\n}\n';

/** What the composition plans there: the foreign hook reflowed by the round trip, beside the engine's own. */
const PLANNED_SETTINGS =
  '{\n  "hooks": [\n    {\n      "command": "vendor-tool sync"\n    },\n' +
  '    {\n      "command": "relay --on=stop",\n      "source": "codeassembly"\n    }\n  ]\n}\n';

/** The declaration the end-to-end cases own `settings.json` through. */
const settingsHooks: OwnedItemsDeclaration = {
  format: 'json',
  collection: ['hooks'],
  sentinel: { path: ['source'], value: 'codeassembly' },
  host: 'settings.json',
  items: [{ command: 'relay --on=stop' }],
};

/** Builds the fixture's target with the owned-items declaration added. */
function buildOwningTarget(targetRoot: string): ReadonlyArray<RenderTarget> {
  return [{ ...buildClaudeTarget(targetRoot), ownedItems: [settingsHooks] }];
}

/** Reads the ownership kind a plan records at `filePath`, failing the test when it plans nothing there. */
function kindAt(plan: Plan, filePath: string): string {
  const file = plan.files.find((entry) => entry.path === filePath);
  if (file === undefined) {
    throw new Error(`The plan carries no file at "${filePath}".`);
  }
  return file.ownership.kind;
}

/** Builds a plan writing one entries host, with both sides registered as bodies. */
function buildEntriesPlan(root: string, current: string, planned: string): Plan {
  return buildSingleFilePlan(
    root,
    {
      targetId: 'claude',
      path: 'settings.json',
      status: 'changed',
      ownership: {
        kind: 'entries',
        format: 'json',
        collections: [{ path: ['hooks'], sentinel: { path: ['source'], value: 'codeassembly' } }],
      },
      current: { hash: hashUtf8(current) },
      planned: { hash: hashUtf8(planned) },
      contributors: { artifacts: [], partials: [] },
    },
    {
      [hashUtf8(current)]: { encoding: 'utf8', data: current },
      [hashUtf8(planned)]: { encoding: 'utf8', data: planned },
    },
  );
}

/** Builds a plan writing `file` into `root`, with the bodies a destination's planned side names. */
function buildSingleFilePlan(root: string, file: FileEntry, blobs?: Record<Hash, Blob>): Plan {
  return {
    ...buildPlan(),
    targets: [{ id: 'claude', label: 'Claude', root, tokenMappings: [], containerDirs: ['skills'] }],
    files: [file],
    blobs: blobs ?? { [PLANNED_HASH]: { encoding: 'utf8', data: PLANNED_BODY } },
  };
}

/** Reads what became of one destination, by the path the plan carries it at. */
function findAction(files: ReadonlyArray<{ path: string; action: string }>, filePath: string): string | undefined {
  return files.find((file) => file.path === filePath)?.action;
}

// endregion | Helpers
