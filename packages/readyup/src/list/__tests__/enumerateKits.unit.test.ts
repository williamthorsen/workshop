import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { enumerateKits } from '../enumerateKits.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'enumerateKits-' })),
);

describe(enumerateKits, () => {
  it('returns base names matching the given extension, sorted alphabetically', ({ temp }) => {
    temp.write('b.ts', '');
    temp.write('a.ts', '');
    temp.write('c.js', '');

    const result = enumerateKits({ dir: temp.dir, extension: '.ts' });

    expect(result).toStrictEqual(['a', 'b']);
  });

  it('returns empty array when directory does not exist', ({ temp }) => {
    const result = enumerateKits({ dir: temp.resolve('nonexistent'), extension: '.ts' });

    expect(result).toStrictEqual([]);
  });

  it('excludes hidden files', ({ temp }) => {
    temp.write('.hidden.ts', '');
    temp.write('visible.ts', '');

    const result = enumerateKits({ dir: temp.dir, extension: '.ts' });

    expect(result).toStrictEqual(['visible']);
  });

  it('excludes subdirectories even if their names match the extension', ({ temp }) => {
    temp.mkdir('subdir.ts');
    temp.write('file.ts', '');

    const result = enumerateKits({ dir: temp.dir, extension: '.ts' });

    expect(result).toStrictEqual(['file']);
  });

  it('returns empty array when no files match the extension', ({ temp }) => {
    temp.write('file.js', '');

    const result = enumerateKits({ dir: temp.dir, extension: '.ts' });

    expect(result).toStrictEqual([]);
  });

  it('strips the extension from results', ({ temp }) => {
    temp.write('default.js', '');

    const result = enumerateKits({ dir: temp.dir, extension: '.js' });

    expect(result).toStrictEqual(['default']);
  });

  it('rethrows non-ENOENT filesystem errors', ({ temp }) => {
    // Make directory unreadable to trigger EACCES
    const restricted = temp.mkdir('restricted');
    fs.chmodSync(restricted, 0o000);

    expect(() => enumerateKits({ dir: restricted, extension: '.ts' })).toThrow(
      expect.objectContaining({ code: 'EACCES' }),
    );

    // Restore permissions for cleanup
    fs.chmodSync(restricted, 0o755);
  });
});
