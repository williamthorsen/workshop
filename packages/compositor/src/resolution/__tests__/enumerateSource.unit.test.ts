import { chmod, symlink } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ResolveKind, SourceSpec } from '../../schemas/resolution-schemas.ts';
import { enumerateSource, type SourceArtifact } from '../enumerateSource.ts';
import { buildSource } from '../test-utils/buildSource.ts';

const rulebookKind: ResolveKind = {
  id: 'rulebook',
  label: 'Rulebook',
  emitsFiles: true,
  layout: { form: 'file', root: 'guidance/rulebooks', extension: '.md' },
};
const skillKind: ResolveKind = {
  id: 'skill',
  label: 'Skill',
  emitsFiles: true,
  layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
};

describe(enumerateSource, () => {
  it('finds one artifact per file for a file kind, dropping the extension from the slug', async () => {
    const source = await buildSource({
      'guidance/rulebooks/naming.md': 'naming',
      'guidance/rulebooks/style.md': 'style',
    });

    await expect(collectSlugs(source, [rulebookKind])).resolves.toStrictEqual(['naming', 'style']);
  });

  it('finds one artifact per directory for a directory kind, naming it for the directory', async () => {
    const source = await buildSource({
      'skills/lint/SKILL.md': 'lint',
      'skills/review/SKILL.md': 'review',
    });

    await expect(collectSlugs(source, [skillKind])).resolves.toStrictEqual(['lint', 'review']);
  });

  it('locates a directory kind at its entry file, in posix form', async () => {
    const source = await buildSource({ 'skills/lint/SKILL.md': 'lint' });

    expect((await enumerateSource(source, [skillKind])).at(0)?.path).toBe('skills/lint/SKILL.md');
  });

  it('skips a directory that carries no entry file', async () => {
    const source = await buildSource({
      'skills/lint/SKILL.md': 'lint',
      'skills/notaskill/README.md': 'support content',
    });

    await expect(collectSlugs(source, [skillKind])).resolves.toStrictEqual(['lint']);
  });

  it('skips a directory whose entry file is itself a directory', async () => {
    const source = await buildSource({
      'skills/lint/SKILL.md': 'lint',
      'skills/decoy/SKILL.md/inner.txt': 'a directory named like an entry file',
    });

    await expect(collectSlugs(source, [skillKind])).resolves.toStrictEqual(['lint']);
  });

  it('skips a loose file sitting in a directory kind root', async () => {
    const source = await buildSource({
      'skills/lint/SKILL.md': 'lint',
      'skills/README.md': 'not a skill',
    });

    await expect(collectSlugs(source, [skillKind])).resolves.toStrictEqual(['lint']);
  });

  it('skips a directory sitting in a file kind root', async () => {
    const source = await buildSource({
      'guidance/rulebooks/naming.md': 'naming',
      'guidance/rulebooks/nested/style.md': 'nested',
    });

    await expect(collectSlugs(source, [rulebookKind])).resolves.toStrictEqual(['naming']);
  });

  it('skips a file whose extension the kind does not declare', async () => {
    const source = await buildSource({
      'guidance/rulebooks/naming.md': 'naming',
      'guidance/rulebooks/notes.txt': 'notes',
    });

    await expect(collectSlugs(source, [rulebookKind])).resolves.toStrictEqual(['naming']);
  });

  it.each(['_partials', '.hidden'])('skips support content named %s', async (name) => {
    const source = await buildSource({
      'skills/lint/SKILL.md': 'lint',
      [`skills/${name}/SKILL.md`]: 'support content',
    });

    await expect(collectSlugs(source, [skillKind])).resolves.toStrictEqual(['lint']);
  });

  it('follows a symlinked artifact directory, which a linked install layout produces', async () => {
    const source = await buildSource({ 'skills/lint/SKILL.md': 'lint', 'elsewhere/shared/SKILL.md': 'shared' });
    await symlink(path.join(source.dir, 'elsewhere/shared'), path.join(source.dir, 'skills/shared'));

    await expect(collectSlugs(source, [skillKind])).resolves.toStrictEqual(['lint', 'shared']);
  });

  it('skips a symlinked artifact whose target is gone, rather than carrying one nothing can read', async () => {
    const source = await buildSource({ 'skills/lint/SKILL.md': 'lint' });
    await symlink(path.join(source.dir, 'skills/never-created'), path.join(source.dir, 'skills/dangling'));

    await expect(collectSlugs(source, [skillKind])).resolves.toStrictEqual(['lint']);
  });

  it('carries nothing for a kind whose root the source does not have', async () => {
    const source = await buildSource({ 'skills/lint/SKILL.md': 'lint' });

    await expect(collectSlugs(source, [rulebookKind, skillKind])).resolves.toStrictEqual(['lint']);
  });

  it('fails rather than reporting an absence when a kind root cannot be read', async () => {
    const source = await buildSource({ 'skills/lint/SKILL.md': 'lint' });
    const skillsDir = path.join(source.dir, 'skills');
    await chmod(skillsDir, 0o000);

    try {
      // An unreadable root must not read as an empty one: that would silently hand the artifact to a lower source.
      await expect(enumerateSource(source, [skillKind])).rejects.toThrow(/EACCES/);
    } finally {
      // Restored before the fixture is removed, since the cleanup cannot descend into an unreadable directory.
      await chmod(skillsDir, 0o755);
    }
  });

  it('orders its results by kind, then by slug', async () => {
    const source = await buildSource({
      'guidance/rulebooks/style.md': 'style',
      'guidance/rulebooks/naming.md': 'naming',
      'skills/review/SKILL.md': 'review',
      'skills/lint/SKILL.md': 'lint',
    });

    await expect(collectSlugs(source, [rulebookKind, skillKind])).resolves.toStrictEqual([
      'naming',
      'style',
      'lint',
      'review',
    ]);
  });
});

describe('artifact digests', () => {
  it('digests a file kind over the file body', async () => {
    const same = await buildSource({ 'guidance/rulebooks/naming.md': 'naming' });
    const differs = await buildSource({ 'guidance/rulebooks/naming.md': 'naming, revised' });

    await expect(requireArtifactHash(same, rulebookKind)).resolves.not.toBe(
      await requireArtifactHash(differs, rulebookKind),
    );
  });

  it('digests a directory kind over the whole artifact, so a changed asset moves it', async () => {
    const before = await buildSource({ 'skills/lint/SKILL.md': 'lint', 'skills/lint/run.mjs': 'v1' });
    const after = await buildSource({ 'skills/lint/SKILL.md': 'lint', 'skills/lint/run.mjs': 'v2' });

    await expect(requireArtifactHash(before, skillKind)).resolves.not.toBe(await requireArtifactHash(after, skillKind));
  });

  it('gives the same artifact the same digest in two sources, so an identical copy is recognizable', async () => {
    const here = await buildSource({ 'skills/lint/SKILL.md': 'lint', 'skills/lint/run.mjs': 'v1' });
    const there = await buildSource({ 'skills/lint/SKILL.md': 'lint', 'skills/lint/run.mjs': 'v1' });

    await expect(requireArtifactHash(here, skillKind)).resolves.toBe(await requireArtifactHash(there, skillKind));
  });
});

// region | Helpers

/** The slugs the source carries across `kinds`, in enumeration order. */
async function collectSlugs(source: SourceSpec, kinds: ReadonlyArray<ResolveKind>): Promise<Array<string>> {
  return (await enumerateSource(source, kinds)).map((artifact: SourceArtifact) => artifact.slug);
}

/** The digest of the source's single artifact of `kind`, failing the test when it carries none. */
async function requireArtifactHash(source: SourceSpec, kind: ResolveKind): Promise<string> {
  const artifact = (await enumerateSource(source, [kind])).at(0);
  if (artifact === undefined) {
    throw new Error(`Fixture carries no ${kind.id}.`);
  }
  return artifact.hash;
}

// endregion | Helpers
