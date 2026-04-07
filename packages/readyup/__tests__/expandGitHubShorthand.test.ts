import { describe, expect, it } from 'vitest';

import { expandGitHubShorthand } from '../src/expandGitHubShorthand.ts';

describe(expandGitHubShorthand, () => {
  it('expands org/repo/path@ref to a raw URL', () => {
    expect(expandGitHubShorthand('org/repo/path.js@v1')).toBe('https://raw.githubusercontent.com/org/repo/v1/path.js');
  });

  it('expands a deep path with a ref', () => {
    expect(expandGitHubShorthand('org/repo/deep/path.js@main')).toBe(
      'https://raw.githubusercontent.com/org/repo/main/deep/path.js',
    );
  });

  it('defaults ref to main when no @ is present', () => {
    expect(expandGitHubShorthand('org/repo/path.js')).toBe('https://raw.githubusercontent.com/org/repo/main/path.js');
  });

  it('throws when fewer than 3 segments are provided', () => {
    expect(() => expandGitHubShorthand('org/repo')).toThrow('expected at least "org/repo/file"');
  });

  it('splits on the last @ when multiple @ symbols are present', () => {
    expect(expandGitHubShorthand('org/repo/path.js@v1@v2')).toBe(
      'https://raw.githubusercontent.com/org/repo/v2/path.js@v1',
    );
  });

  it('throws when ref after @ is empty', () => {
    expect(() => expandGitHubShorthand('org/repo/path.js@')).toThrow("ref after '@' must not be empty");
  });
});
