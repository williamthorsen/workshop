import assert from 'node:assert';
import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { GIT_ADAPTERS } from '../../commands/repo-commands.ts';
import { git, initWithCommit } from '../../test-utils/git-fixture.ts';
import { executeMove } from '../move-clone.ts';
import { planMove } from '../move-plan.ts';

describe(executeMove, () => {
  it('moves a clone with its sibling worktree under a new basename and repairs a worktree that stays', () => {
    using tree = createTempTree({ 'oss/app/README.md': '', 'elsewhere/.keep': '' }, { prefix: 'repo-tools-' });
    const root = fs.realpathSync(tree.dir);
    const primary = `${root}/oss/app`;
    initWithCommit(primary);
    git(primary, 'worktree', 'add', '--quiet', '-b', 'live', `${root}/oss/app.live`);
    git(primary, 'worktree', 'add', '--quiet', '-b', 'spike', `${root}/elsewhere/spike`);

    const worktrees = GIT_ADAPTERS.listWorktrees(primary);
    assert.ok(typeof worktrees !== 'string', 'git cannot list the worktrees');
    const plan = planMove({ from: primary, to: `${root}/tools/kit` }, worktrees, GIT_ADAPTERS);
    assert.ok(!Array.isArray(plan), 'the move is refused');
    const outcome = executeMove(plan, GIT_ADAPTERS);

    expect(outcome.failure).toBeUndefined();
    expect(fs.existsSync(primary)).toBe(false);
    for (const dir of [`${root}/tools/kit`, `${root}/tools/kit.live`, `${root}/elsewhere/spike`]) {
      expect(git(dir, 'status', '--short')).toBe('');
    }
    expect(git(`${root}/tools/kit.live`, 'branch', '--show-current').trim()).toBe('live');
  });
});
