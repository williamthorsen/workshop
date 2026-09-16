import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { deriveKitName, deriveKitNameFromBundle } from '../deriveKitName.ts';

// The separator is read through `path.sep`, which one test replaces; an unrestored spy would reach every test after it.
afterEach(() => {
  vi.restoreAllMocks();
});

describe(deriveKitName, () => {
  it('returns a top-level source under its own name', () => {
    expect(deriveKitName('deploy.ts', '.ts')).toBe('deploy');
  });

  it('keeps the directory of a nested source in the name', () => {
    expect(deriveKitName('team-a/deploy.ts', '.ts')).toBe('team-a/deploy');
  });

  it('keeps every level of a deeply nested source', () => {
    expect(deriveKitName('team-a/ops/deploy.ts', '.ts')).toBe('team-a/ops/deploy');
  });

  it('strips only the named extension, so a declaration source keeps its inner one', () => {
    expect(deriveKitName('types.d.ts', '.ts')).toBe('types.d');
  });

  it('leaves a path that does not end in the named extension whole', () => {
    expect(deriveKitName('deploy.js', '.ts')).toBe('deploy.js');
  });

  it('strips the bundle extension when that is the one named', () => {
    expect(deriveKitName('ops/deploy.js', '.js')).toBe('ops/deploy');
  });

  it('reports a Windows separator as the `/` that the manifest records', () => {
    vi.spyOn(path, 'sep', 'get').mockReturnValue('\\');

    expect(deriveKitName(String.raw`team-a\deploy.ts`, '.ts')).toBe('team-a/deploy');
  });
});

describe(deriveKitNameFromBundle, () => {
  it('names a bundle at the root of the output directory by its basename', () => {
    expect(deriveKitNameFromBundle('/repo/.readyup/kits/deploy.js', '/repo/.readyup/kits')).toBe('deploy');
  });

  it('keeps the subdirectory of a nested bundle in the name', () => {
    expect(deriveKitNameFromBundle('/repo/.readyup/kits/ops/deploy.js', '/repo/.readyup/kits')).toBe('ops/deploy');
  });

  it('falls back to the basename for a bundle outside the output directory', () => {
    expect(deriveKitNameFromBundle('/repo/build/ops/deploy.js', '/repo/.readyup/kits')).toBe('deploy');
  });

  it('falls back to the basename for a bundle that is the output directory itself', () => {
    expect(deriveKitNameFromBundle('/repo/.readyup/kits', '/repo/.readyup/kits')).toBe('kits');
  });
});
