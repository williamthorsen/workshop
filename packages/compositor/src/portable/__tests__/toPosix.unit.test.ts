import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { toPosix } from '../toPosix.ts';

describe(toPosix, () => {
  it('renders a natively joined path with posix separators', () => {
    // Built with `path.join` rather than written with literal backslashes: a literal would assert Windows behavior on
    // every platform, and pass only where `path.sep` happens to be a backslash.
    expect(toPosix(path.join('skills', 'lint', 'SKILL.md'))).toBe('skills/lint/SKILL.md');
  });

  it('leaves an already-posix path unchanged', () => {
    expect(toPosix('skills/lint/SKILL.md')).toBe('skills/lint/SKILL.md');
  });

  it('leaves a path with no separator unchanged', () => {
    expect(toPosix('SKILL.md')).toBe('SKILL.md');
  });
});
