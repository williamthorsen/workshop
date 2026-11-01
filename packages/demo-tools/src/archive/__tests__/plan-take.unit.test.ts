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
        voice: { provider: 'local', voiceId: 'af_heart' },
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

  it("resolves the voice from the root's .env over the environment passed to aidemo", () => {
    using tree = createRepo({ '.env': 'AIDEMO_TTS_PROVIDER=elevenlabs\n' });

    const disposition = planTake(createInput(tree, { aidemoEnv: { AIDEMO_TTS_PROVIDER: 'local' } }));

    expect(disposition.kind === 'archive' && disposition.plan.voice.provider).toBe('elevenlabs');
  });

  it('takes the default voice from a storyboard that is not JSON', () => {
    using tree = createRepo({ 'demos/quickstart/generated/storyboard.json': '{' });

    const disposition = planTake(createInput(tree));

    expect(disposition.kind === 'archive' && disposition.plan.voice).toStrictEqual({
      provider: 'openai',
      voiceId: 'marin',
    });
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
    aidemoEnv: {},
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

/** Creates a repository root with the `quickstart` demo's storyboard, plus `extra` files. */
function createRepo(extra: Record<string, string> = {}): TempTree {
  return createTempTree({ 'demos/quickstart/generated/storyboard.json': STORYBOARD, ...extra });
}

// endregion | Helpers
