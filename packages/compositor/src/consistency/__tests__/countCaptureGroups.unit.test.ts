import { describe, expect, it } from 'vitest';

import { countCaptureGroups } from '../countCaptureGroups.ts';

describe(countCaptureGroups, () => {
  it('counts the one group a well-formed declaration captures', () => {
    expect(countCaptureGroups(String.raw`\{tool:([a-z]+)\}`)).toBe(1);
  });

  it('counts none for a pattern that captures nothing', () => {
    expect(countCaptureGroups(String.raw`\{tool:[a-z]+\}`)).toBe(0);
  });

  it('counts every group, so a pattern leaving the engine a choice is visible', () => {
    expect(countCaptureGroups(String.raw`\[([^\]]*)\]\(([^)]+)\)`)).toBe(2);
  });

  it('counts a group a pattern requires a body to reach, since no body is run', () => {
    expect(countCaptureGroups('^x+(y)$')).toBe(1);
  });

  it('reports nothing for a pattern that does not compile', () => {
    expect(countCaptureGroups('([a-z')).toBeUndefined();
  });

  it('reports nothing for a pattern ending in an escape, which the empty branch would otherwise absorb', () => {
    expect(countCaptureGroups('^#\\')).toBeUndefined();
  });
});
