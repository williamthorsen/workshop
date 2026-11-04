import { createHash } from 'node:crypto';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { planTake, type PlanTakeInput } from '../plan-take.ts';

const STORYBOARD = '{"voice":{"voiceId":"marin"}}';

const RENDERED_AT = new Date('2026-11-01T03:04:05.000Z');

const SOURCE = { commit: 'abc1234def', dirty: false };

describe(planTake, () => {
  it('plans the archive with the state captured before the render', () => {
    using tree = createRepo();

    expect(planTake(createInput(tree, { params: ['--tts', 'local'] }))).toStrictEqual({
      kind: 'archive',
      plan: {
        aidemoVersion: '0.20.0',
        archiveRoot: '/archive',
        demo: 'quickstart',
        demoDir: tree.resolve('demos/quickstart'),
        label: 'demos',
        params: ['--tts', 'local'],
        renderedAt: RENDERED_AT,
        source: SOURCE,
        storyboardSha256: createHash('sha256').update(STORYBOARD).digest('hex'),
      },
    });
  });

  it("reads the source state of the repository's root", () => {
    using tree = createRepo();
    const dirs: string[] = [];

    planTake({
      ...createInput(tree),
      readSourceState: (dir) => {
        dirs.push(dir);
        return undefined;
      },
    });

    expect(dirs).toStrictEqual([tree.dir]);
  });

  it.each([
    [['--lang', 'de'], '--lang'],
    [['--langs=de,fr'], '--langs'],
    [['--variants'], '--variants'],
  ])('reports that a render with %o is not archived', (params, option) => {
    using tree = createRepo();

    expect(planTake(createInput(tree, { params }))).toStrictEqual({
      kind: 'notice',
      message: `take not archived: ${option} renders are not archived`,
    });
  });

  it('reports a missing archive root, naming both ways to set one', () => {
    using tree = createRepo();

    expect(planTake(createInput(tree, { archiveRoot: undefined }))).toStrictEqual({
      kind: 'notice',
      message:
        'take not archived: no archive root is set; set archive.root in ~/.config/thor-demo/config.yaml or THOR_DEMO_ARCHIVE_ROOT',
    });
  });
});

// region | Helpers

/** Builds the input for the tree's `quickstart` demo, with `overrides` applied. */
function createInput(tree: TempTree, overrides: Partial<PlanTakeInput> = {}): PlanTakeInput {
  return {
    aidemoVersion: '0.20.0',
    archiveLabel: 'demos',
    archiveRoot: '/archive',
    demoDir: tree.resolve('demos/quickstart'),
    demosRoot: tree.resolve('demos'),
    params: [],
    readSourceState: () => SOURCE,
    renderedAt: RENDERED_AT,
    root: tree.dir,
    ...overrides,
  };
}

/** Creates a repository root with the `quickstart` demo's storyboard. */
function createRepo(): TempTree {
  return createTempTree({ 'demos/quickstart/generated/storyboard.json': STORYBOARD });
}

// endregion | Helpers
