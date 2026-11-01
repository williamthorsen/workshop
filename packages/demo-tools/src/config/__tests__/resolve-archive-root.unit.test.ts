import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { type ArchiveRootResult, MACHINE_CONFIG_PATH, resolveArchiveRoot } from '../resolve-archive-root.ts';

describe(resolveArchiveRoot, () => {
  it('leaves the root unset when neither the variable nor the file sets it', () => {
    using home = createTempTree({ '.keep': '' });

    expect(resolveArchiveRoot({ env: {}, homeDir: home.dir })).toStrictEqual({ ok: true, archiveRoot: undefined });
  });

  it('reads archive.root from the machine configuration, expanding ~ and ${VAR}', () => {
    using home = createTempTree({ [MACHINE_CONFIG_PATH]: 'archive:\n  root: ~/takes/${KIND}\n' });

    expect(resolveArchiveRoot({ env: { KIND: 'demos' }, homeDir: home.dir })).toStrictEqual({
      ok: true,
      archiveRoot: `${home.dir}/takes/demos`,
    });
  });

  it('prefers THOR_DEMO_ARCHIVE_ROOT to the machine configuration', () => {
    using home = createTempTree({ [MACHINE_CONFIG_PATH]: 'archive:\n  root: /from/file\n' });

    expect(resolveArchiveRoot({ env: { THOR_DEMO_ARCHIVE_ROOT: '/from/env' }, homeDir: home.dir })).toStrictEqual({
      ok: true,
      archiveRoot: '/from/env',
    });
  });

  it('ignores an empty THOR_DEMO_ARCHIVE_ROOT', () => {
    using home = createTempTree({ [MACHINE_CONFIG_PATH]: 'archive:\n  root: /from/file\n' });

    const result = resolveArchiveRoot({ env: { THOR_DEMO_ARCHIVE_ROOT: '' }, homeDir: home.dir });

    expect(result).toStrictEqual({ ok: true, archiveRoot: '/from/file' });
  });

  it.each([
    ['an empty file', ''],
    ['an empty archive section', 'archive:\n'],
  ])('leaves the root unset for %s', (_label, content) => {
    using home = createTempTree({ [MACHINE_CONFIG_PATH]: content });

    expect(resolveArchiveRoot({ env: {}, homeDir: home.dir })).toStrictEqual({ ok: true, archiveRoot: undefined });
  });

  it('refuses a relative THOR_DEMO_ARCHIVE_ROOT', () => {
    using home = createTempTree({ '.keep': '' });

    const result = resolveArchiveRoot({ env: { THOR_DEMO_ARCHIVE_ROOT: 'takes' }, homeDir: home.dir });

    expect(readMessage(result)).toBe('THOR_DEMO_ARCHIVE_ROOT must be an absolute path, not "takes"');
  });

  it.each([
    ['malformed YAML', 'archive: [\n', /cannot be read as YAML/],
    ['a document that is not a mapping', '- a\n', /must be a mapping/],
    ['an unknown top-level key', 'archiveRoot: /x\n', /unknown key "archiveRoot"; the key is archive/],
    ['a non-mapping archive section', 'archive: /x\n', /archive must be a mapping/],
    ['an unknown archive key', 'archive:\n  dir: /x\n', /unknown key "archive\.dir"; the key is root/],
    ['a non-string root', 'archive:\n  root: 9\n', /archive\.root must be a non-empty string/],
    ['an unset variable', 'archive:\n  root: ${UNSET}\n', /archive\.root: UNSET is not set/],
    ['a relative root', 'archive:\n  root: takes\n', /archive\.root must be an absolute path, not "takes"/],
  ])('reports %s, naming the file', (_label, content, expected) => {
    using home = createTempTree({ [MACHINE_CONFIG_PATH]: content });

    const message = readMessage(resolveArchiveRoot({ env: {}, homeDir: home.dir }));

    expect(message).toMatch(expected);
    expect(message.startsWith(home.resolve(MACHINE_CONFIG_PATH))).toBe(true);
  });
});

// region | Helpers

/** Returns the failure message of a result, or an empty string for a success. */
function readMessage(result: ArchiveRootResult): string {
  return result.ok ? '' : result.message;
}

// endregion | Helpers
