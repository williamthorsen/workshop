import { describe, expect, it } from 'vitest';

import { commandExists } from '../../src/check-utils/filesystem.ts';

// Separated from the rest of `filesystem`, whose helpers only read the filesystem: `commandExists` shells out to
// `command -v`, so it reaches a program the environment supplies and belongs to the `tool` tier.
describe(commandExists, () => {
  it('returns true for a command that exists', () => {
    expect(commandExists('node')).toBe(true);
  });

  it('returns false for a command that does not exist', () => {
    expect(commandExists('nonexistent-command-xyz-99')).toBe(false);
  });

  it('returns false for names with shell metacharacters', () => {
    expect(commandExists('node; echo hacked')).toBe(false);
    expect(commandExists('node$(whoami)')).toBe(false);
    expect(commandExists('node|cat')).toBe(false);
  });
});
