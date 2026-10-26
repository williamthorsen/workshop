import { describe, expect, it } from 'vitest';

import { toKebabCase } from '../to-kebab-case.ts';

describe(toKebabCase, () => {
  it('lowercases and turns dots, underscores, and whitespace into hyphens', () => {
    expect(toKebabCase('My.Project_Name')).toBe('my-project-name');
    expect(toKebabCase('this is a description')).toBe('this-is-a-description');
  });

  it('folds a slash like any other separator, producing one path segment', () => {
    expect(toKebabCase('321/feat/foo')).toBe('321-feat-foo');
  });

  it('collapses runs of separators and hyphens and trims hyphens at both ends', () => {
    expect(toKebabCase('--a.._ /b--c-')).toBe('a-b-c');
  });

  it('keeps characters other than separators', () => {
    expect(toKebabCase('MAC-42+x')).toBe('mac-42+x');
  });
});
