import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { encodeSessionDirectoryName } from '../../claude/claude-sessions.ts';
import { GIT_ADAPTERS } from '../../commands/repo-commands.ts';
import { type SettleAdapters, settleMove } from '../settle-move.ts';

describe(settleMove, () => {
  it('allows direnv, moves the session directory, and removes a parent left with only .DS_Store', () => {
    using tree = createTempTree({}, { prefix: 'repo-tools-' });
    const root = fs.realpathSync(tree.dir);
    const move = { from: `${root}/old/app`, to: `${root}/new/kit` };
    writeFiles(root, ['old/.DS_Store', 'new/kit/.envrc', `sessions/${encodeSessionDirectoryName(move.from)}/a.jsonl`]);
    const allowed: string[] = [];

    const lines = settleMove([move], [move], {
      adapters: buildAdapters({ allowDirenv: (dir) => void allowed.push(dir) }),
      home: root,
      isDryRun: false,
      sessionsDir: `${root}/sessions`,
    });

    expect(lines).toStrictEqual([
      { stream: 'stdout', text: 'direnv allow ~/new/kit' },
      {
        stream: 'stdout',
        text: `~/sessions/${encodeSessionDirectoryName(move.from)} -> ~/sessions/${encodeSessionDirectoryName(move.to)}`,
      },
      { stream: 'stdout', text: 'removed ~/old' },
    ]);
    expect(allowed).toStrictEqual([move.to]);
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

    expect(lines.map((line) => line.stream)).toStrictEqual(['stderr', 'stderr', 'stderr', 'stderr']);
    expect(lines[0]?.text).toBe('cannot run direnv allow ~/new/kit: is not allowed');
    expect(lines[1]?.text).toBe('cannot run direnv allow ~/new/kit.live: is not allowed');
    expect(lines[2]?.text).toMatch(/^not moved, because the destination exists; merge them by hand: /);
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
      { stream: 'stdout', text: 'would run direnv allow ~/new/kit' },
      {
        stream: 'stdout',
        text: `would move ~/sessions/${encodeSessionDirectoryName(`${root}/old/app`)} -> ~/sessions/${encodeSessionDirectoryName(`${root}/new/kit`)}`,
      },
      { stream: 'stdout', text: 'would remove ~/old' },
    ]);
    expect(fs.existsSync(`${root}/old/.DS_Store`)).toBe(true);
    expect(fs.existsSync(`${root}/sessions/${encodeSessionDirectoryName(`${root}/old/app`)}`)).toBe(true);
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
