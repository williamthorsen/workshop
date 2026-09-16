import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { deriveKitName } from '../deriveKitName.ts';

describe(deriveKitName, () => {
  it('returns a top-level source under its own name', () => {
    expect(deriveKitName('deploy.ts')).toBe('deploy');
  });

  it('keeps the directory of a nested source in the name', () => {
    expect(deriveKitName('team-a/deploy.ts')).toBe('team-a/deploy');
  });

  it('keeps every level of a deeply nested source', () => {
    expect(deriveKitName('team-a/ops/deploy.ts')).toBe('team-a/ops/deploy');
  });

  it('strips only the final extension, so a declaration source keeps its inner one', () => {
    expect(deriveKitName('types.d.ts')).toBe('types.d');
  });

  it('leaves a path that does not end in the source extension whole', () => {
    expect(deriveKitName('deploy.js')).toBe('deploy.js');
  });

  it('reports a Windows separator as the `/` that the manifest records', () => {
    vi.spyOn(path, 'sep', 'get').mockReturnValue('\\');

    expect(deriveKitName(String.raw`team-a\deploy.ts`)).toBe('team-a/deploy');
  });
});
