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

    const result = enumerateKits({ dir: temp.dir, extension: '.ts', recursive: false });

    expect(result).toStrictEqual(['a', 'b']);
  });

  it('returns empty array when directory does not exist', ({ temp }) => {
    const result = enumerateKits({ dir: temp.resolve('nonexistent'), extension: '.ts', recursive: false });

    expect(result).toStrictEqual([]);
  });

  it('excludes hidden files', ({ temp }) => {
    temp.write('.hidden.ts', '');
    temp.write('visible.ts', '');

    const result = enumerateKits({ dir: temp.dir, extension: '.ts', recursive: false });

    expect(result).toStrictEqual(['visible']);
  });

  it('excludes subdirectories even if their names match the extension', ({ temp }) => {
    temp.mkdir('subdir.ts');
    temp.write('file.ts', '');

    const result = enumerateKits({ dir: temp.dir, extension: '.ts', recursive: false });

    expect(result).toStrictEqual(['file']);
  });

  it('returns empty array when no files match the extension', ({ temp }) => {
    temp.write('file.js', '');

    const result = enumerateKits({ dir: temp.dir, extension: '.ts', recursive: false });

    expect(result).toStrictEqual([]);
  });

  it('strips the extension from results', ({ temp }) => {
    temp.write('default.js', '');

    const result = enumerateKits({ dir: temp.dir, extension: '.js', recursive: false });

    expect(result).toStrictEqual(['default']);
  });

  it('rethrows non-ENOENT filesystem errors', ({ temp }) => {
    // Make directory unreadable to trigger EACCES
    const restricted = temp.mkdir('restricted');
    fs.chmodSync(restricted, 0o000);

    expect(() => enumerateKits({ dir: restricted, extension: '.ts', recursive: false })).toThrow(
      expect.objectContaining({ code: 'EACCES' }),
    );

    // Restore permissions for cleanup
    fs.chmodSync(restricted, 0o755);
  });

  describe('reading subdirectories', () => {
    it('omits a nested file unless the read is recursive', ({ temp }) => {
      temp.write('top.js', '');
      temp.write('ops/deploy.js', '');

      const result = enumerateKits({ dir: temp.dir, extension: '.js', recursive: false });

      expect(result).toStrictEqual(['top']);
    });

    it('names a nested file by its path below the directory', ({ temp }) => {
      temp.write('top.js', '');
      temp.write('ops/deploy.js', '');
      temp.write('team-a/ops/release.js', '');

      const result = enumerateKits({ dir: temp.dir, extension: '.js', recursive: true });

      expect(result).toStrictEqual(['ops/deploy', 'team-a/ops/release', 'top']);
    });

    it('excludes every file below a hidden directory', ({ temp }) => {
      temp.write('.cache/stale.js', '');
      temp.write('ops/deploy.js', '');

      const result = enumerateKits({ dir: temp.dir, extension: '.js', recursive: true });

      expect(result).toStrictEqual(['ops/deploy']);
    });

    it('excludes a hidden file inside a visible subdirectory', ({ temp }) => {
      temp.write('ops/.hidden.js', '');
      temp.write('ops/deploy.js', '');

      const result = enumerateKits({ dir: temp.dir, extension: '.js', recursive: true });

      expect(result).toStrictEqual(['ops/deploy']);
    });

    it('excludes a nested directory whose own name matches the extension', ({ temp }) => {
      temp.mkdir('ops/subdir.js');
      temp.write('ops/deploy.js', '');

      const result = enumerateKits({ dir: temp.dir, extension: '.js', recursive: true });

      expect(result).toStrictEqual(['ops/deploy']);
    });
  });
});
