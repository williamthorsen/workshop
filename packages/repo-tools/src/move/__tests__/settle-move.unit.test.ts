import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { encodeSessionDirectoryName } from '../../claude/claude-sessions.ts';
import { GIT_ADAPTERS } from '../../commands/repo-commands.ts';
import { formatSettleEvent, type SettleAdapters, type SettleEvent, settleMove } from '../settle-move.ts';

describe(settleMove, () => {
  it('allows direnv, moves the session directory, and removes a parent left with only .DS_Store', () => {
    using tree = createTempTree({}, { prefix: 'repo-tools-' });
    const root = fs.realpathSync(tree.dir);
    const move = { from: `${root}/old/app`, to: `${root}/new/kit` };
    writeFiles(root, ['old/.DS_Store', 'new/kit/.envrc', `sessions/${encodeSessionDirectoryName(move.from)}/a.jsonl`]);
    const allowedDirs: string[] = [];

    const lines = settleMove([move], [move], {
      adapters: buildAdapters({ allowDirenv: (dir) => void allowedDirs.push(dir) }),
      home: root,
      isDryRun: false,
      sessionsDir: `${root}/sessions`,
    });

    expect(lines).toStrictEqual([
      { action: 'allow-direnv', path: move.to, status: 'done' },
      {
        action: 'move-session-directory',
        from: `${root}/sessions/${encodeSessionDirectoryName(move.from)}`,
        status: 'done',
        to: `${root}/sessions/${encodeSessionDirectoryName(move.to)}`,
      },
      { action: 'remove-directory', path: `${root}/old`, status: 'done' },
    ]);
    expect(allowedDirs).toStrictEqual([move.to]);
    expect(fs.existsSync(`${root}/sessions/${encodeSessionDirectoryName(move.to)}/a.jsonl`)).toBe(true);
    expect(fs.existsSync(`${root}/old`)).toBe(false);
  });

  it('keeps a parent with other content and a session directory whose destination exists, and reports failures', () => {
    using tree = createTempTree({}, { prefix: 'repo-tools-' });
    const root = fs.realpathSync(tree.dir);
    const moves = [
      { from: `${root}/old/app`, to: `${root}/new/kit` },
      { from: `${root}/old/app.live`, to: `${root}/new/kit.live` },
    ];
    writeFiles(root, [
      'old/notes.md',
      'new/kit/.envrc',
      'new/kit.live/.envrc',
      ...moves.flatMap((move) => [
        `sessions/${encodeSessionDirectoryName(move.from)}/a.jsonl`,
        `sessions/${encodeSessionDirectoryName(move.to)}/b.jsonl`,
      ]),
    ]);

    const lines = settleMove(moves, moves, {
      adapters: buildAdapters({ allowDirenv: () => 'is not allowed' }),
      home: root,
      isDryRun: false,
      sessionsDir: `${root}/sessions`,
    });

    expect(lines.map((line) => line.status)).toStrictEqual([
      'failed',
      'failed',
      'destination-exists',
      'destination-exists',
    ]);
    expect(lines[0]).toStrictEqual({
      action: 'allow-direnv',
      path: `${root}/new/kit`,
      reason: 'is not allowed',
      status: 'failed',
    });
    expect(lines[1]).toMatchObject({ action: 'allow-direnv', path: `${root}/new/kit.live`, status: 'failed' });
    expect(lines[2]).toMatchObject({ action: 'move-session-directory' });
    expect(fs.existsSync(`${root}/sessions/${encodeSessionDirectoryName(moves[0]?.from ?? '')}`)).toBe(true);
    expect(fs.existsSync(`${root}/old/notes.md`)).toBe(true);
  });

  it('says nothing about direnv when it is not installed', () => {
    using tree = createTempTree({}, { prefix: 'repo-tools-' });
    const root = fs.realpathSync(tree.dir);
    const moves = [
      { from: `${root}/a/app`, to: `${root}/b/kit` },
      { from: `${root}/a/app.live`, to: `${root}/b/kit.live` },
    ];
    writeFiles(root, ['a/.keep', 'b/kit/.envrc', 'b/kit.live/.envrc']);
    let calls = 0;

    const lines = settleMove(moves, moves, {
      adapters: buildAdapters({
        allowDirenv: () => {
          calls += 1;
          return 'absent';
        },
      }),
      home: root,
      isDryRun: false,
      sessionsDir: `${root}/sessions`,
    });

    expect(lines).toStrictEqual([]);
    expect(calls).toBe(1);
  });

  it('reports every action under a dry run against the state before the move, and performs none', () => {
    using tree = createTempTree({}, { prefix: 'repo-tools-' });
    const root = fs.realpathSync(tree.dir);
    const moves = [
      { from: `${root}/old/app`, to: `${root}/new/kit` },
      { from: `${root}/keep/app`, to: `${root}/keep/sub/app` },
    ];
    writeFiles(root, [
      'old/.DS_Store',
      'old/app/.envrc',
      'keep/app/README.md',
      `sessions/${encodeSessionDirectoryName(`${root}/old/app`)}/a.jsonl`,
    ]);

    const lines = settleMove(moves, moves, {
      adapters: buildAdapters({ allowDirenv: () => 'not exercised', isDirenvInstalled: () => true }),
      home: root,
      isDryRun: true,
      sessionsDir: `${root}/sessions`,
    });

    expect(lines).toStrictEqual([
      { action: 'allow-direnv', path: `${root}/new/kit`, status: 'planned' },
      {
        action: 'move-session-directory',
        from: `${root}/sessions/${encodeSessionDirectoryName(`${root}/old/app`)}`,
        status: 'planned',
        to: `${root}/sessions/${encodeSessionDirectoryName(`${root}/new/kit`)}`,
      },
      { action: 'remove-directory', path: `${root}/old`, status: 'planned' },
    ]);
    expect(fs.existsSync(`${root}/old/.DS_Store`)).toBe(true);
    expect(fs.existsSync(`${root}/sessions/${encodeSessionDirectoryName(`${root}/old/app`)}`)).toBe(true);
  });

  it('renames the session directory without a home directory', () => {
    using tree = createTempTree({}, { prefix: 'repo-tools-' });
    const root = fs.realpathSync(tree.dir);
    const move = { from: `${root}/app`, to: `${root}/kit` };
    writeFiles(root, [`sessions/${encodeSessionDirectoryName(move.from)}/a.jsonl`]);

    const lines = settleMove([move], [], {
      adapters: buildAdapters({}),
      home: '',
      isDryRun: false,
      sessionsDir: `${root}/sessions`,
    });

    expect(lines).toStrictEqual([
      {
        action: 'move-session-directory',
        from: `${root}/sessions/${encodeSessionDirectoryName(move.from)}`,
        status: 'done',
        to: `${root}/sessions/${encodeSessionDirectoryName(move.to)}`,
      },
    ]);
  });

  it.each([false, true])('reports once that it cannot locate the sessions directory, dry run %s', (isDryRun) => {
    const moves = [
      { from: '/srv/app', to: '/srv/kit' },
      { from: '/srv/app.live', to: '/srv/kit.live' },
    ];
    const lines = settleMove(moves, [], {
      adapters: buildAdapters({}),
      home: '',
      isDryRun,
      sessionsDir: undefined,
    });
    expect(lines).toStrictEqual([
      {
        action: 'locate-session-directories',
        reason: 'CLAUDE_CONFIG_DIR is unset, and HOME is unset or empty',
        status: 'failed',
      },
    ]);
  });
});

describe(formatSettleEvent, () => {
  const sessions = { from: '/home/me/sessions/a', to: '/home/me/sessions/b' };
  const cases: Array<[SettleEvent, string, string]> = [
    [{ action: 'allow-direnv', path: '/home/me/kit', status: 'done' }, 'stdout', 'direnv allow ~/kit'],
    [{ action: 'allow-direnv', path: '/home/me/kit', status: 'planned' }, 'stdout', 'would run direnv allow ~/kit'],
    [
      { action: 'allow-direnv', path: '/home/me/kit', reason: 'denied', status: 'failed' },
      'stderr',
      'cannot run direnv allow ~/kit: denied',
    ],
    [
      { action: 'locate-session-directories', reason: 'HOME is unset', status: 'failed' },
      'stderr',
      'session directories not renamed: HOME is unset',
    ],
    [{ action: 'move-session-directory', ...sessions, status: 'done' }, 'stdout', '~/sessions/a -> ~/sessions/b'],
    [
      { action: 'move-session-directory', ...sessions, status: 'planned' },
      'stdout',
      'would move ~/sessions/a -> ~/sessions/b',
    ],
    [
      { action: 'move-session-directory', ...sessions, status: 'destination-exists' },
      'stderr',
      'not moved, because the destination exists; merge them by hand: ~/sessions/a -> ~/sessions/b',
    ],
    [
      { action: 'move-session-directory', ...sessions, reason: 'busy', status: 'failed' },
      'stderr',
      'cannot move ~/sessions/a -> ~/sessions/b: busy',
    ],
    [{ action: 'remove-directory', path: '/home/me/old', status: 'done' }, 'stdout', 'removed ~/old'],
    [{ action: 'remove-directory', path: '/home/me/old', status: 'planned' }, 'stdout', 'would remove ~/old'],
    [
      { action: 'remove-directory', path: '/home/me/old', reason: 'busy', status: 'failed' },
      'stderr',
      'cannot remove ~/old: busy',
    ],
    [
      { action: 'remove-directory', path: '/home/me/old', reason: 'denied', status: 'unreadable' },
      'stderr',
      'cannot read ~/old: denied',
    ],
  ];

  it.each(cases)('formats %o', (event, stream, text) => {
    expect(formatSettleEvent(event, '/home/me')).toStrictEqual({ stream, text });
  });
});

// region | Helpers

/** Builds adapters over the real filesystem with the given direnv operations. */
function buildAdapters(direnv: Partial<Pick<SettleAdapters, 'allowDirenv' | 'isDirenvInstalled'>>): SettleAdapters {
  return { ...GIT_ADAPTERS, isDirenvInstalled: () => false, ...direnv };
}

/** Creates empty files, with their parent directories, at paths relative to a root. */
function writeFiles(root: string, files: readonly string[]): void {
  for (const file of files) {
    fs.mkdirSync(`${root}/${file.slice(0, file.lastIndexOf('/'))}`, { recursive: true });
    fs.writeFileSync(`${root}/${file}`, '');
  }
}

// endregion | Helpers
