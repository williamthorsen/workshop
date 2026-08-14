import type { ResolveKind } from '../../schemas/catalog-schemas.ts';
import type { MarkerPair, RenderTarget } from '../../schemas/render-target-schemas.ts';

/** Builds the target the plan tests deploy into: skills as a tree, rulebooks aggregated into one region host. */
export function buildClaudeTarget(targetRoot: string): RenderTarget {
  return {
    id: 'claude',
    label: 'Claude',
    root: targetRoot,
    tokenMappings: [],
    deployments: [
      { form: 'tree', kindId: 'skill', layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' } },
      {
        form: 'region',
        kindId: 'rulebook',
        host: HOST_PATH,
        markers: REGION_MARKERS,
        contributionMarkers: CONTRIBUTION_MARKERS,
      },
    ],
    stages: [{ kind: 'transclusion', syntax: { open: '<!--', close: '-->' } }],
  };
}

/** Builds the source tree the plan tests compose over, fresh so that a test may add to it or take from it. */
export function buildCompositionSourceFiles(): Record<string, string | Uint8Array> {
  return {
    'collections/core.md': '# Core\n',
    'rulebooks/naming.md': 'Name things well.\n',
    'rulebooks/style.md': 'Write plainly.\n',
    'skills/lint/SKILL.md': '# Lint\n',
    'skills/review/SKILL.md': '# Review\n',
    'skills/review/diagram.png': DIAGRAM_BYTES,
    'subagents/auditor.md': '# Auditor\n',
  };
}

/**
 * The kinds the plan tests are written against.
 *
 * Covers what composition has to tell apart: an aggregate producing no output, a kind laid out as a directory per
 * artifact so that it ships assets beside its entry file, a kind routed into a shared region, and a kind no target
 * deploys.
 */
export const COMPOSITION_KINDS: ReadonlyArray<ResolveKind> = [
  {
    id: 'collection',
    label: 'Collection',
    emitsFiles: false,
    layout: { form: 'file', root: 'collections', extension: '.md' },
  },
  {
    id: 'rulebook',
    label: 'Rulebook',
    emitsFiles: true,
    layout: { form: 'file', root: 'rulebooks', extension: '.md' },
  },
  {
    id: 'skill',
    label: 'Skill',
    emitsFiles: true,
    layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
  },
  {
    id: 'subagent',
    label: 'Subagent',
    emitsFiles: true,
    layout: { form: 'file', root: 'subagents', extension: '.md' },
  },
];

/** The markers delimiting a contributor's own block within the fixture's region host. */
export const CONTRIBUTION_MARKERS: MarkerPair = {
  open: '<!-- {artifactId} -->',
  close: '<!-- /{artifactId} -->',
};

/** A PNG signature, standing in for an asset a skill ships and no target transforms. */
export const DIAGRAM_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The path of the region host the fixture's rulebooks aggregate into. */
export const HOST_PATH = 'CLAUDE.md';

/** The markers fencing the span the engine owns within the fixture's region host. */
export const REGION_MARKERS: MarkerPair = {
  open: '<!-- codeassembly -->',
  close: '<!-- /codeassembly -->',
};
