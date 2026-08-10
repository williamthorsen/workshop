import { describe, expect, it } from 'vitest';

import { useTempDir } from '../../test-utils/tempDir.ts';
import { readToolVersionsNode } from '../tool-versions.ts';

const temp = useTempDir({ prefix: 'rdy-tool-versions-', cwd: 'mock' });

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
    temp.write('.tool-versions.local', 'nodejs 20.19.0\n');

    expect(readToolVersionsNode('.tool-versions.local')).toBe('20.19.0');
  });
});

// region | Helpers

/** Writes the given lines to `.tool-versions`, the default path the check reads. */
function writeToolVersions(lines: string[]): void {
  temp.write('.tool-versions', lines.join('\n'));
}

// endregion | Helpers
