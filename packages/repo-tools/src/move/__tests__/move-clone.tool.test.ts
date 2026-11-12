import assert from 'node:assert';
import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { encodeSessionDirectoryName } from '../../claude/claude-sessions.ts';
import { GIT_ADAPTERS } from '../../commands/repo-commands.ts';
import { git, initWithCommit } from '../../test-utils/git-fixture.ts';
import { executeMove } from '../move-clone.ts';
import { planMove } from '../move-plan.ts';
import { settleMove } from '../settle-move.ts';

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

  it('settles a move: moves the session directory of a worktree inside the primary and removes the emptied parent', () => {
    using tree = createTempTree({ 'oss/app/README.md': '', 'oss/.DS_Store': '' }, { prefix: 'repo-tools-' });
    const root = fs.realpathSync(tree.dir);
    const primary = `${root}/oss/app`;
    const nested = `${primary}/.claude/worktrees/spike`;
    initWithCommit(primary);
    git(primary, 'worktree', 'add', '--quiet', '-b', 'spike', nested);
    const sessionsDir = `${root}/sessions`;
    fs.mkdirSync(`${sessionsDir}/${encodeSessionDirectoryName(nested)}`, { recursive: true });

    const worktrees = GIT_ADAPTERS.listWorktrees(primary);
    assert.ok(typeof worktrees !== 'string', 'git cannot list the worktrees');
    const plan = planMove({ from: primary, to: `${root}/tools/kit` }, worktrees, GIT_ADAPTERS);
    assert.ok(!Array.isArray(plan), 'the move is refused');
    const outcome = executeMove(plan, GIT_ADAPTERS);
    const lines = settleMove(outcome.relocated, outcome.completed, {
      adapters: { ...GIT_ADAPTERS, allowDirenv: () => 'absent' },
      home: root,
      isDryRun: false,
      sessionsDir,
    });

    const movedNested = `${root}/tools/kit/.claude/worktrees/spike`;
    expect(outcome.failure).toBeUndefined();
    expect(lines.map((line) => line.stream)).toStrictEqual(['stdout', 'stdout']);
    expect(fs.existsSync(`${sessionsDir}/${encodeSessionDirectoryName(movedNested)}`)).toBe(true);
    expect(fs.existsSync(`${root}/oss`)).toBe(false);
    expect(git(movedNested, 'status', '--short')).toBe('');
  });
});
