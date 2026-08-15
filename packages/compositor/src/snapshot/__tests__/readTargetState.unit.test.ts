import { describe, expect, it } from 'vitest';

import type { KindDeployment, RenderTarget } from '../../schemas/render-target-schemas.ts';
import { buildTempTree } from '../../test-utils/buildTempTree.ts';
import type { ClaimedFile, HostState } from '../readTargetState.ts';
import { readTargetState } from '../readTargetState.ts';

const skills: KindDeployment = {
  form: 'tree',
  kindId: 'skill',
  layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
};

const rulebooks: KindDeployment = {
  form: 'tree',
  kindId: 'rulebook',
  layout: { form: 'file', root: 'rulebooks', extension: '.md' },
  nameTemplate: 'consult-{slug}',
};

const ambient: KindDeployment = {
  form: 'region',
  kindId: 'rulebook',
  host: 'CLAUDE.md',
  markers: { open: '<!-- codeassembly -->', close: '<!-- /codeassembly -->' },
  contributionMarkers: { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' },
};

const hostContent = [
  '# Guidance',
  '',
  '<!-- codeassembly -->',
  '<!-- rulebook:shell -->',
  'Use long-form options.',
  '<!-- /rulebook:shell -->',
  '<!-- /codeassembly -->',
  '',
  'Written by hand.',
].join('\n');

describe(readTargetState, () => {
  it('claims a file whose name inverts through the kind’s template', async () => {
    const state = await readState({ 'rulebooks/consult-shell.md': 'Shell rules.\n' }, [rulebooks]);

    expect(claimOf(state.claimed, 'rulebooks/consult-shell.md')?.claims).toStrictEqual([
      { id: 'rulebook:shell', kindId: 'rulebook', slug: 'shell' },
    ]);
  });

  it('recovers the kind and slug behind a claimed id, which no catalog answers once it is deleted', async () => {
    const state = await readState({ 'skills/review/SKILL.md': '# Review\n' }, [skills]);

    expect(claimOf(state.claimed, 'skills/review/SKILL.md')?.claims).toStrictEqual([
      { id: 'skill:review', kindId: 'skill', slug: 'review' },
    ]);
  });

  it('claims every file a claimed artifact directory holds, so an asset is planned beside its entry file', async () => {
    const state = await readState(
      {
        'skills/review/SKILL.md': '# Review\n',
        'skills/review/assets/diagram.svg': '<svg />\n',
      },
      [skills],
    );

    expect(state.claimed.map(({ path, claims }) => [path, claims.map(({ id }) => id)])).toStrictEqual([
      ['skills/review/SKILL.md', ['skill:review']],
      ['skills/review/assets/diagram.svg', ['skill:review']],
    ]);
  });

  it('carries each claimed body, which is the current side a plan diffs against', async () => {
    const state = await readState({ 'rulebooks/consult-shell.md': 'Shell rules.\n' }, [rulebooks]);

    expect(claimOf(state.claimed, 'rulebooks/consult-shell.md')?.body).toStrictEqual({
      encoding: 'utf8',
      data: 'Shell rules.\n',
    });
  });

  // A rulebook deploying as a `consult-*` skill lands among ordinary skills, whose untemplated rule claims every name.
  it('claims a path two deployments both match once, naming each artifact their rules recover', async () => {
    const consultSkills = { ...skills, kindId: 'rulebook', nameTemplate: 'consult-{slug}' } as const;
    const state = await readState(
      { 'skills/consult-shell/SKILL.md': '# Shell\n', 'skills/review/SKILL.md': '# Review\n' },
      [skills, consultSkills],
    );

    expect(state.claimed.map(({ path, claims }) => [path, claims])).toStrictEqual([
      [
        'skills/consult-shell/SKILL.md',
        [
          { id: 'rulebook:shell', kindId: 'rulebook', slug: 'shell' },
          { id: 'skill:consult-shell', kindId: 'skill', slug: 'consult-shell' },
        ],
      ],
      ['skills/review/SKILL.md', [{ id: 'skill:review', kindId: 'skill', slug: 'review' }]],
    ]);
  });

  it('leaves a name the template could not have produced unclaimed', async () => {
    const state = await readState({ 'rulebooks/handwritten.md': 'Mine.\n' }, [rulebooks]);

    expect(state.claimed).toStrictEqual([]);
  });

  it('leaves a support-prefixed name unclaimed', async () => {
    const state = await readState({ 'skills/_shared/SKILL.md': '# Shared\n', 'skills/.cache/SKILL.md': '# Cached\n' }, [
      skills,
    ]);

    expect(state.claimed).toStrictEqual([]);
  });

  it('leaves a directory missing its entry file unclaimed, so a foreign directory is not offered for removal', async () => {
    const state = await readState({ 'skills/review/notes.md': '# Notes\n' }, [skills]);

    expect(state.claimed).toStrictEqual([]);
  });

  it('passes over tool state inside a claimed artifact, matching the digest its source is identified by', async () => {
    const state = await readState({ 'skills/review/SKILL.md': '# Review\n', 'skills/review/.DS_Store': 'junk' }, [
      skills,
    ]);

    expect(state.claimed.map(({ path }) => path)).toStrictEqual(['skills/review/SKILL.md']);
  });

  it('leaves a declared host unclaimed where a layout would otherwise claim it', async () => {
    const guidance: KindDeployment = {
      form: 'tree',
      kindId: 'guidance',
      layout: { form: 'file', root: '', extension: '.md' },
    };
    const state = await readState({ 'CLAUDE.md': hostContent, 'README.md': '# Read me\n' }, [guidance, ambient]);

    expect(state.claimed.map(({ path }) => path)).toStrictEqual(['README.md']);
  });

  it('reads the contributions a host’s region carries', async () => {
    const state = await readState({ 'CLAUDE.md': hostContent }, [ambient]);

    expect(presentHost(state.hosts)).toMatchObject({
      region: { state: 'complete' },
      contributions: [{ key: 'rulebook:shell', body: 'Use long-form options.' }],
    });
  });

  it('reports a host it does not find as absent', async () => {
    const state = await readState({ 'README.md': '# Read me\n' }, [ambient]);

    expect(state.hosts).toStrictEqual([{ kindId: 'rulebook', path: 'CLAUDE.md', state: 'absent' }]);
  });

  it('reads no contribution out of a damaged host, and carries the reason a reader repairs it by', async () => {
    const damaged = `<!-- codeassembly -->\n<!-- rulebook:shell -->\nStray.\n<!-- /rulebook:shell -->\n`;
    const state = await readState({ 'CLAUDE.md': damaged }, [ambient]);

    const host = presentHost(state.hosts);
    expect(host?.region).toStrictEqual({
      state: 'malformed',
      reason: 'The host carries 1 open marker and no close marker, but a region is exactly one of each.',
    });
    expect(host?.contributions).toStrictEqual([]);
  });

  it('digests two targets holding identical content alike, whatever order the scan reached them in', async () => {
    const files = {
      'CLAUDE.md': hostContent,
      'rulebooks/consult-shell.md': 'Shell rules.\n',
      'skills/review/SKILL.md': '# Review\n',
      'skills/review/assets/diagram.svg': '<svg />\n',
    };
    const deployments = [skills, rulebooks, ambient];

    const first = await readState(files, deployments);
    const second = await readState(files, deployments.toReversed());

    expect(second.digest).toBe(first.digest);
  });

  it('moves the digest when a claimed body changes', async () => {
    const before = await readState({ 'rulebooks/consult-shell.md': 'Shell rules.\n' }, [rulebooks]);
    const after = await readState({ 'rulebooks/consult-shell.md': 'Other rules.\n' }, [rulebooks]);

    expect(after.digest).not.toBe(before.digest);
  });

  it('moves the digest when a host changes', async () => {
    const before = await readState({ 'CLAUDE.md': hostContent }, [ambient]);
    const after = await readState({ 'CLAUDE.md': `${hostContent}\nMore.\n` }, [ambient]);

    expect(after.digest).not.toBe(before.digest);
  });

  it('reads a target holding nothing as holding nothing', async () => {
    const state = await readState({ 'unrelated.txt': 'x' }, [skills, rulebooks]);

    expect(state).toMatchObject({ targetId: 'claude', claimed: [], hosts: [] });
  });
});

// region | Helpers

/** Finds the claim at `filePath`, so an assertion names the file it is about. */
function claimOf(claimed: ReadonlyArray<ClaimedFile>, filePath: string): ClaimedFile | undefined {
  return claimed.find((file) => file.path === filePath);
}

/** Narrows to the one present host a test built, the absent arm carrying none of the fields under assertion. */
function presentHost(hosts: ReadonlyArray<HostState>): Extract<HostState, { state: 'present' }> | undefined {
  return hosts.find((host) => host.state === 'present');
}

/** Reads the state of a target rooted at a temporary tree holding `files` and deploying `deployments`. */
async function readState(
  files: Record<string, string>,
  deployments: ReadonlyArray<KindDeployment>,
): Promise<Awaited<ReturnType<typeof readTargetState>>> {
  const root = await buildTempTree(files, 'compositor-target');
  const target: RenderTarget = {
    id: 'claude',
    label: 'Claude',
    root,
    tokenMappings: [],
    deployments: [...deployments],
    stages: [],
  };

  return readTargetState(target, { baseDir: root });
}

// endregion | Helpers
