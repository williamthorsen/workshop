import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { readToolVersionsNode } from '../tool-versions.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-tool-versions-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe(readToolVersionsNode, () => {
  it('reads a plain nodejs entry', ({ temp }) => {
    writeToolVersions(temp, ['nodejs 24.18.0', '']);

    expect(readToolVersionsNode()).toBe('24.18.0');
  });

  it('reads an entry written with the `node` tool name', ({ temp }) => {
    writeToolVersions(temp, ['node 22.11.0', '']);

    expect(readToolVersionsNode()).toBe('22.11.0');
  });

  it('ignores a trailing comment', ({ temp }) => {
    writeToolVersions(temp, ['nodejs 24.18.0 # pinned to the engines floor', '']);

    expect(readToolVersionsNode()).toBe('24.18.0');
  });

  it('takes the first of several fallback versions', ({ temp }) => {
    writeToolVersions(temp, ['nodejs 24.18.0 22.11.0 20.19.0', '']);

    expect(readToolVersionsNode()).toBe('24.18.0');
  });

  it('skips other tools, comment lines, and blank lines', ({ temp }) => {
    writeToolVersions(temp, ['# Managed by mise', '', 'pnpm 11.15.0', '\tnodejs\t24.18.0', 'python 3.13.0', '']);

    expect(readToolVersionsNode()).toBe('24.18.0');
  });

  it('takes the first Node declaration when several are present', ({ temp }) => {
    writeToolVersions(temp, ['nodejs 24.18.0', 'nodejs 22.11.0', '']);

    expect(readToolVersionsNode()).toBe('24.18.0');
  });

  it('skips a Node line that names no version', ({ temp }) => {
    writeToolVersions(temp, ['nodejs', 'nodejs 24.18.0', '']);

    expect(readToolVersionsNode()).toBe('24.18.0');
  });

  it('returns undefined when no Node entry is present', ({ temp }) => {
    writeToolVersions(temp, ['pnpm 11.15.0', '']);

    expect(readToolVersionsNode()).toBeUndefined();
  });

  it('returns undefined when the file is absent', () => {
    expect(readToolVersionsNode()).toBeUndefined();
  });

  it('reads a file at a caller-supplied path', ({ temp }) => {
    temp.write('.tool-versions.local', 'nodejs 20.19.0\n');

    expect(readToolVersionsNode('.tool-versions.local')).toBe('20.19.0');
  });
});

// region | Helpers

/** Writes the given lines to `.tool-versions`, the default path the check reads. */
function writeToolVersions(temp: TempTree, lines: string[]): void {
  temp.write('.tool-versions', lines.join('\n'));
}

// endregion | Helpers
