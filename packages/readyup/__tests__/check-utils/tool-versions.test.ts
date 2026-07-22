import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { readToolVersionsNode } from '../../src/check-utils/tool-versions.ts';

let tempDir: string;
let cwdSpy: MockInstance;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'rdy-tool-versions-'));
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  cwdSpy.mockRestore();
});

describe(readToolVersionsNode, () => {
  it('reads a plain nodejs entry', () => {
    writeToolVersions(['nodejs 24.18.0', '']);

    expect(readToolVersionsNode()).toBe('24.18.0');
  });

  it('reads an entry written with the `node` tool name', () => {
    writeToolVersions(['node 22.11.0', '']);

    expect(readToolVersionsNode()).toBe('22.11.0');
  });

  it('ignores a trailing comment', () => {
    writeToolVersions(['nodejs 24.18.0 # pinned to the engines floor', '']);

    expect(readToolVersionsNode()).toBe('24.18.0');
  });

  it('takes the first of several fallback versions', () => {
    writeToolVersions(['nodejs 24.18.0 22.11.0 20.19.0', '']);

    expect(readToolVersionsNode()).toBe('24.18.0');
  });

  it('skips other tools, comment lines, and blank lines', () => {
    writeToolVersions(['# Managed by mise', '', 'pnpm 11.15.0', '\tnodejs\t24.18.0', 'python 3.13.0', '']);

    expect(readToolVersionsNode()).toBe('24.18.0');
  });

  it('takes the first Node declaration when several are present', () => {
    writeToolVersions(['nodejs 24.18.0', 'nodejs 22.11.0', '']);

    expect(readToolVersionsNode()).toBe('24.18.0');
  });

  it('skips a Node line that names no version', () => {
    writeToolVersions(['nodejs', 'nodejs 24.18.0', '']);

    expect(readToolVersionsNode()).toBe('24.18.0');
  });

  it('returns undefined when no Node entry is present', () => {
    writeToolVersions(['pnpm 11.15.0', '']);

    expect(readToolVersionsNode()).toBeUndefined();
  });

  it('returns undefined when the file is absent', () => {
    expect(readToolVersionsNode()).toBeUndefined();
  });

  it('reads a file at a caller-supplied path', () => {
    writeFileSync(join(tempDir, '.tool-versions.local'), 'nodejs 20.19.0\n');

    expect(readToolVersionsNode('.tool-versions.local')).toBe('20.19.0');
  });
});

// region | Helpers

/** Writes the given lines to `.tool-versions` in the temp directory. */
function writeToolVersions(lines: string[]): void {
  writeFileSync(join(tempDir, '.tool-versions'), lines.join('\n'));
}

// endregion | Helpers
