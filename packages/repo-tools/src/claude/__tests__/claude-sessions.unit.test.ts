import { describe, expect, it } from 'vitest';

import { encodeSessionDirectoryName, readSessionsDir } from '../claude-sessions.ts';

describe(encodeSessionDirectoryName, () => {
  it('replaces each non-alphanumeric character with a hyphen', () => {
    expect(encodeSessionDirectoryName('/Users/a.b/repos/oss/workshop.827')).toBe('-Users-a-b-repos-oss-workshop-827');
  });
});

describe(readSessionsDir, () => {
  it.each([
    [{}, '/home/spec/.claude/projects'],
    [{ CLAUDE_CONFIG_DIR: '' }, '/home/spec/.claude/projects'],
    [{ CLAUDE_CONFIG_DIR: '/opt/claude/' }, '/opt/claude/projects'],
  ])('reads %j', (env, expected) => {
    expect(readSessionsDir(env, '/home/spec')).toBe(expected);
  });
});
