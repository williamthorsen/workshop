import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import type { ResolveKind, SourceSpec } from '../../schemas/resolution-schemas.ts';
import { assertSourceIsReadable, enumerateSource, type SourceArtifact } from '../enumerateSource.ts';

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

    await expect(slugsOf(source, [rulebookKind])).resolves.toStrictEqual(['naming', 'style']);
  });

  it('finds one artifact per directory for a directory kind, naming it for the directory', async () => {
    const source = await buildSource({
      'skills/lint/SKILL.md': 'lint',
      'skills/review/SKILL.md': 'review',
    });

    await expect(slugsOf(source, [skillKind])).resolves.toStrictEqual(['lint', 'review']);
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

    await expect(slugsOf(source, [skillKind])).resolves.toStrictEqual(['lint']);
  });

  it('skips a directory whose entry file is itself a directory', async () => {
    const source = await buildSource({
      'skills/lint/SKILL.md': 'lint',
      'skills/decoy/SKILL.md/inner.txt': 'a directory named like an entry file',
    });

    await expect(slugsOf(source, [skillKind])).resolves.toStrictEqual(['lint']);
  });

  it('skips a loose file sitting in a directory kind root', async () => {
    const source = await buildSource({
      'skills/lint/SKILL.md': 'lint',
      'skills/README.md': 'not a skill',
    });

    await expect(slugsOf(source, [skillKind])).resolves.toStrictEqual(['lint']);
  });

  it('skips a directory sitting in a file kind root', async () => {
    const source = await buildSource({
      'guidance/rulebooks/naming.md': 'naming',
      'guidance/rulebooks/nested/style.md': 'nested',
    });

    await expect(slugsOf(source, [rulebookKind])).resolves.toStrictEqual(['naming']);
  });

  it('skips a file whose extension the kind does not declare', async () => {
    const source = await buildSource({
      'guidance/rulebooks/naming.md': 'naming',
      'guidance/rulebooks/notes.txt': 'notes',
    });

    await expect(slugsOf(source, [rulebookKind])).resolves.toStrictEqual(['naming']);
  });

  it.each(['_partials', '.hidden'])('skips support content named %s', async (name) => {
    const source = await buildSource({
      'skills/lint/SKILL.md': 'lint',
      [`skills/${name}/SKILL.md`]: 'support content',
    });

    await expect(slugsOf(source, [skillKind])).resolves.toStrictEqual(['lint']);
  });

  it('follows a symlinked artifact directory, which a linked install layout produces', async () => {
    const source = await buildSource({ 'skills/lint/SKILL.md': 'lint', 'elsewhere/shared/SKILL.md': 'shared' });
    await symlink(path.join(source.dir, 'elsewhere/shared'), path.join(source.dir, 'skills/shared'));

    await expect(slugsOf(source, [skillKind])).resolves.toStrictEqual(['lint', 'shared']);
  });

  it('carries nothing for a kind whose root the source does not have', async () => {
    const source = await buildSource({ 'skills/lint/SKILL.md': 'lint' });

    await expect(slugsOf(source, [rulebookKind, skillKind])).resolves.toStrictEqual(['lint']);
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

    await expect(slugsOf(source, [rulebookKind, skillKind])).resolves.toStrictEqual([
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

    await expect(hashOf(same, rulebookKind)).resolves.not.toBe(await hashOf(differs, rulebookKind));
  });

  it('digests a directory kind over the whole artifact, so a changed asset moves it', async () => {
    const before = await buildSource({ 'skills/lint/SKILL.md': 'lint', 'skills/lint/run.mjs': 'v1' });
    const after = await buildSource({ 'skills/lint/SKILL.md': 'lint', 'skills/lint/run.mjs': 'v2' });

    await expect(hashOf(before, skillKind)).resolves.not.toBe(await hashOf(after, skillKind));
  });

  it('moves a directory kind digest when an asset is renamed but its bytes are not', async () => {
    const before = await buildSource({ 'skills/lint/SKILL.md': 'lint', 'skills/lint/run.mjs': 'v1' });
    const after = await buildSource({ 'skills/lint/SKILL.md': 'lint', 'skills/lint/start.mjs': 'v1' });

    await expect(hashOf(before, skillKind)).resolves.not.toBe(await hashOf(after, skillKind));
  });

  it('reaches assets nested below the artifact root', async () => {
    const before = await buildSource({ 'skills/lint/SKILL.md': 'lint', 'skills/lint/data/rules.json': '{"a":1}' });
    const after = await buildSource({ 'skills/lint/SKILL.md': 'lint', 'skills/lint/data/rules.json': '{"a":2}' });

    await expect(hashOf(before, skillKind)).resolves.not.toBe(await hashOf(after, skillKind));
  });

  it('gives the same artifact the same digest in two sources, so an identical copy is recognizable', async () => {
    const here = await buildSource({ 'skills/lint/SKILL.md': 'lint', 'skills/lint/run.mjs': 'v1' });
    const there = await buildSource({ 'skills/lint/SKILL.md': 'lint', 'skills/lint/run.mjs': 'v1' });

    await expect(hashOf(here, skillKind)).resolves.toBe(await hashOf(there, skillKind));
  });
});

describe(assertSourceIsReadable, () => {
  it('accepts a source pointing at a directory', async () => {
    const source = await buildSource({ 'skills/lint/SKILL.md': 'lint' });

    await expect(assertSourceIsReadable(source)).resolves.toBeUndefined();
  });

  it('rejects a source pointing at nothing', async () => {
    const source = await buildSource({});

    await expect(assertSourceIsReadable({ ...source, dir: path.join(source.dir, 'absent') })).rejects.toThrow(
      /does not exist/,
    );
  });

  it('rejects a source pointing at a file', async () => {
    const source = await buildSource({ 'guidance.md': 'not a directory' });

    await expect(assertSourceIsReadable({ ...source, dir: path.join(source.dir, 'guidance.md') })).rejects.toThrow(
      /not a directory/,
    );
  });
});

/** A source directory holding each path in `files` with the given content, removed when the test ends. */
async function buildSource(files: Record<string, string>): Promise<SourceSpec> {
  const dir = await mkdtemp(path.join(tmpdir(), 'compositor-source-'));
  onTestFinished(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(dir, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  }

  return { id: 'fixture', name: 'fixture', origin: { kind: 'directory', location: dir }, dir };
}

/** The digest of the source's single artifact of `kind`, failing the test when it carries none. */
async function hashOf(source: SourceSpec, kind: ResolveKind): Promise<string> {
  const artifact = (await enumerateSource(source, [kind])).at(0);
  if (artifact === undefined) {
    throw new Error(`Fixture carries no ${kind.id}.`);
  }
  return artifact.hash;
}

/** The slugs the source carries across `kinds`, in enumeration order. */
async function slugsOf(source: SourceSpec, kinds: ReadonlyArray<ResolveKind>): Promise<Array<string>> {
  return (await enumerateSource(source, kinds)).map((artifact: SourceArtifact) => artifact.slug);
}
