import { describe, expect, it } from 'vitest';

import { findProtectingPattern } from '../findProtectingPattern.ts';
import { parseProtectList } from '../readProtectList.ts';

const ENTRIES = parseProtectList(
  '~/repos/atlassian/mcp-*\n~/repos/personal/codeassembly\n~/repos/*/*.live\n',
  '/Users/me',
);

describe(findProtectingPattern, () => {
  it('matches the directory that a pattern names', () => {
    expect(findProtectingPattern('/Users/me/repos/atlassian/mcp-jira', ENTRIES)?.pattern).toBe(
      '~/repos/atlassian/mcp-*',
    );
  });

  it('matches a directory beneath the one that a pattern names', () => {
    expect(findProtectingPattern('/Users/me/repos/personal/codeassembly/packages/a', ENTRIES)?.pattern).toBe(
      '~/repos/personal/codeassembly',
    );
  });

  it('matches a live worktree and its subdirectories', () => {
    expect(findProtectingPattern('/Users/me/repos/projects/prizereader.live', ENTRIES)?.pattern).toBe(
      '~/repos/*/*.live',
    );
    expect(findProtectingPattern('/Users/me/repos/projects/prizereader.live/packages/web', ENTRIES)?.pattern).toBe(
      '~/repos/*/*.live',
    );
  });

  it('returns the first matching entry', () => {
    const entries = parseProtectList('~/repos/*/*.live\n~/repos/projects\n', '/Users/me');

    expect(findProtectingPattern('/Users/me/repos/projects/x.live', entries)?.pattern).toBe('~/repos/*/*.live');
  });

  it('returns undefined when no pattern matches', () => {
    expect(findProtectingPattern('/Users/me/repos/packages/toolbelt.368', ENTRIES)).toBeUndefined();
  });
});
