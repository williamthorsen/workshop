import { describe, expect, it } from 'vitest';

import type { RenderTarget } from '../../../schemas/render-target-schemas.ts';
import {
  AMBIENT_DEPLOYMENT,
  CLAUDE_TARGET,
  SETTINGS_HOOKS,
  SKILL_DEPLOYMENT,
} from '../../test-utils/sample-render-targets.ts';
import { findOwnedItemsFaults } from '../findOwnedItemsFaults.ts';

describe(findOwnedItemsFaults, () => {
  it('accepts a target declaring no owned items', () => {
    expect(findOwnedItemsFaults(CLAUDE_TARGET, 'targets[0]')).toStrictEqual([]);
  });

  it('accepts a target owning items in a host nothing else writes', () => {
    expect(findOwnedItemsFaults({ ...CLAUDE_TARGET, ownedItems: [SETTINGS_HOOKS] }, 'targets[0]')).toStrictEqual([]);
  });

  it('accepts two declarations owning different collections of one host', () => {
    const owning: RenderTarget = {
      ...CLAUDE_TARGET,
      ownedItems: [
        { ...SETTINGS_HOOKS, collection: ['hooks', 'SessionStart'] },
        { ...SETTINGS_HOOKS, collection: ['hooks', 'Stop'] },
      ],
    };

    expect(findOwnedItemsFaults(owning, 'targets[0]')).toStrictEqual([]);
  });

  it('reports two declarations contending for one collection of one host', () => {
    const contested: RenderTarget = { ...CLAUDE_TARGET, ownedItems: [SETTINGS_HOOKS, SETTINGS_HOOKS] };

    expect(findOwnedItemsFaults(contested, 'targets[0]')).toStrictEqual([
      { path: 'targets[0].ownedItems', message: expect.stringContaining('"settings.json at hooks"') },
    ]);
  });

  it('reports two declarations disagreeing about their host\u{2019}s format, a file having one', () => {
    const mixed: RenderTarget = {
      ...CLAUDE_TARGET,
      ownedItems: [
        { ...SETTINGS_HOOKS, collection: ['hooks', 'SessionStart'] },
        { ...SETTINGS_HOOKS, collection: ['hooks', 'Stop'], format: 'yaml' },
      ],
    };

    expect(findOwnedItemsFaults(mixed, 'targets[0]')).toStrictEqual([
      {
        path: 'targets[0].ownedItems[1].format',
        message: expect.stringMatching(/"yaml".*"json"/),
      },
    ]);
  });

  it.each([
    ['an outer collection declared first', ['hooks'], ['hooks', 'Stop']],
    ['an inner collection declared first', ['hooks', 'Stop'], ['hooks']],
  ])('reports %s nesting inside the other on one host', (_label, first, second) => {
    const nested: RenderTarget = {
      ...CLAUDE_TARGET,
      ownedItems: [
        { ...SETTINGS_HOOKS, collection: [...first] },
        { ...SETTINGS_HOOKS, collection: [...second] },
      ],
    };

    expect(findOwnedItemsFaults(nested, 'targets[0]')).toStrictEqual([
      {
        path: 'targets[0].ownedItems[1].collection',
        message: expect.stringContaining(`"${first.join('.')}"`),
      },
    ]);
  });

  it('accepts declarations whose collections branch apart at unequal depths, none holding another', () => {
    const branching: RenderTarget = {
      ...CLAUDE_TARGET,
      ownedItems: [
        { ...SETTINGS_HOOKS, collection: ['hooks', 'Stop'] },
        { ...SETTINGS_HOOKS, collection: ['hooks', 'SessionStart', 'shell'] },
        { ...SETTINGS_HOOKS, collection: ['agents'] },
      ],
    };

    expect(findOwnedItemsFaults(branching, 'targets[0]')).toStrictEqual([]);
  });

  it('reports an item a stampable sentinel could not be written into', () => {
    const scalar: RenderTarget = { ...CLAUDE_TARGET, ownedItems: [{ ...SETTINGS_HOOKS, items: ['relay --on=stop'] }] };

    expect(findOwnedItemsFaults(scalar, 'targets[0]')).toStrictEqual([
      {
        path: 'targets[0].ownedItems[0].items[0]',
        message: expect.stringContaining('"source"'),
      },
    ]);
  });

  it('reports an item whose sentinel path runs through a value that is not a mapping', () => {
    const blocked: RenderTarget = {
      ...CLAUDE_TARGET,
      ownedItems: [
        {
          ...SETTINGS_HOOKS,
          sentinel: { path: ['meta', 'writtenBy'], value: 'codeassembly' },
          items: [{ meta: 'vendor-tool' }],
        },
      ],
    };

    expect(findOwnedItemsFaults(blocked, 'targets[0]')).toStrictEqual([
      {
        path: 'targets[0].ownedItems[0].items[0]',
        message: expect.stringMatching(/"meta\.writtenBy".*"meta"/),
      },
    ]);
  });

  it('reports a host a region deployment already writes whole', () => {
    const contested: RenderTarget = {
      ...CLAUDE_TARGET,
      deployments: [SKILL_DEPLOYMENT, AMBIENT_DEPLOYMENT],
      ownedItems: [{ ...SETTINGS_HOOKS, host: 'CLAUDE.md' }],
    };

    expect(findOwnedItemsFaults(contested, 'targets[0]')).toStrictEqual([
      {
        path: 'targets[0].ownedItems[0].host',
        message: expect.stringContaining('region host'),
      },
    ]);
  });

  it('reports a host standing where a tree layout needs a directory', () => {
    const contested: RenderTarget = { ...CLAUDE_TARGET, ownedItems: [{ ...SETTINGS_HOOKS, host: 'skills' }] };

    expect(findOwnedItemsFaults(contested, 'targets[0]')).toStrictEqual([
      {
        path: 'targets[0].ownedItems[0].host',
        message: expect.stringContaining('"skills"'),
      },
    ]);
  });

  it('reports an item the declaration could never find again, under a sentinel it cannot write', () => {
    const unmarkable: RenderTarget = {
      ...CLAUDE_TARGET,
      ownedItems: [
        {
          ...SETTINGS_HOOKS,
          sentinel: { path: ['commands', '*'], value: '--sentinel codeassembly', match: 'contains' },
          items: [{ commands: ['relay --on=stop'] }],
        },
      ],
    };

    expect(findOwnedItemsFaults(unmarkable, 'targets[0]')).toStrictEqual([
      {
        path: 'targets[0].ownedItems[0].items[0]',
        message: expect.stringContaining('does not have the sentinel'),
      },
    ]);
  });

  it('accepts an item that already has a sentinel the declaration cannot write', () => {
    const marked: RenderTarget = {
      ...CLAUDE_TARGET,
      ownedItems: [
        {
          ...SETTINGS_HOOKS,
          sentinel: { path: ['commands', '*'], value: '--sentinel codeassembly', match: 'contains' },
          items: [{ commands: ['relay --on=stop --sentinel codeassembly'] }],
        },
      ],
    };

    expect(findOwnedItemsFaults(marked, 'targets[0]')).toStrictEqual([]);
  });

  it('reports the repeat first, then each declaration in the order host, nesting, format, region host, items', () => {
    const wrong: RenderTarget = {
      ...CLAUDE_TARGET,
      deployments: [SKILL_DEPLOYMENT, { ...AMBIENT_DEPLOYMENT, host: 'skills' }],
      ownedItems: [
        { ...SETTINGS_HOOKS, host: 'skills' },
        { ...SETTINGS_HOOKS, host: 'skills', collection: ['hooks', 'Stop'], format: 'yaml', items: ['scalar'] },
        { ...SETTINGS_HOOKS, host: 'skills' },
      ],
    };

    expect(findOwnedItemsFaults(wrong, 'targets[0]').map(({ path }) => path)).toStrictEqual([
      'targets[0].ownedItems',
      'targets[0].ownedItems[0].host',
      'targets[0].ownedItems[0].host',
      'targets[0].ownedItems[1].host',
      'targets[0].ownedItems[1].collection',
      'targets[0].ownedItems[1].format',
      'targets[0].ownedItems[1].host',
      'targets[0].ownedItems[1].items[0]',
      'targets[0].ownedItems[2].host',
      'targets[0].ownedItems[2].collection',
      'targets[0].ownedItems[2].host',
    ]);
  });
});
