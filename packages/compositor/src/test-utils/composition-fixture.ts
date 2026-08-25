import type { ResolveKind } from '../schemas/catalog-schemas.ts';
import type { OwnedItemsDeclaration } from '../schemas/owned-items-schemas.ts';
import type { MarkerPair, RenderTarget } from '../schemas/render-target-schemas.ts';

/** Builds the target the flow tests deploy into: skills as a tree, rulebooks aggregated into one region host. */
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

/** Builds the source tree the flow tests compose over, fresh so that a test may add to it or take from it. */
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
 * Builds the target the inlay tests deploy into, which is the flow target with an inlay stage over it.
 *
 * The inlay's contribution markers differ from the region's, so a filled inlay inside a routed contribution stays
 * distinguishable from the contribution it sits in.
 */
export function buildInlayingTarget(targetRoot: string): RenderTarget {
  const claude = buildClaudeTarget(targetRoot);

  return {
    ...claude,
    stages: [
      ...claude.stages,
      {
        kind: 'inlay',
        syntax: { open: '<!--', close: '-->' },
        markers: INLAY_MARKERS,
        contributionMarkers: FILL_MARKERS,
      },
    ],
  };
}

/**
 * Builds a target whose two deployments are rooted at one directory, rulebooks deploying under a template among an
 * untemplated kind's own artifacts.
 *
 * The overlap is what makes a claimed path's provenance undecidable and a planned destination contested, so one
 * declaration serves both sides of that fact.
 */
export function buildOverlappingTargets(targetRoot: string): ReadonlyArray<RenderTarget> {
  const claude = buildClaudeTarget(targetRoot);

  return [
    {
      ...claude,
      deployments: [
        ...claude.deployments.filter((deployment) => deployment.kindId !== 'rulebook'),
        {
          form: 'tree',
          kindId: 'rulebook',
          layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
          nameTemplate: 'consult-{slug}',
        },
      ],
    },
  ];
}

/**
 * Builds the target the entries tests deploy into, which is the flow target with one owned-items declaration over it.
 *
 * The host sits beside the flow target's region host, so one target exercises both ways a destination can be partly
 * the engine's.
 */
export function buildOwningTarget(targetRoot: string): ReadonlyArray<RenderTarget> {
  return [{ ...buildClaudeTarget(targetRoot), ownedItems: [SETTINGS_HOOKS] }];
}

/**
 * The kinds the flow tests are written against.
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

/** The markers delimiting one filler's block within a filled inlay. */
export const FILL_MARKERS: MarkerPair = {
  open: '<!-- fill:{artifactId} -->',
  close: '<!-- /fill:{artifactId} -->',
};

/** The path of the region host the fixture's rulebooks aggregate into. */
export const HOST_PATH = 'CLAUDE.md';

/** The markers fencing a whole filled inlay in the body that declared it. */
export const INLAY_MARKERS: MarkerPair = {
  open: '<!-- inlay:{inlayName}:start -->',
  close: '<!-- inlay:{inlayName}:end -->',
};

/** The markers fencing the span the engine owns within the fixture's region host. */
export const REGION_MARKERS: MarkerPair = {
  open: '<!-- codeassembly -->',
  close: '<!-- /codeassembly -->',
};

/** The collection the entries tests own inside a structured host another tool also writes. */
export const SETTINGS_HOOKS: OwnedItemsDeclaration = {
  format: 'json',
  collection: ['hooks'],
  sentinel: { path: ['source'], value: 'codeassembly' },
  host: 'settings.json',
  items: [{ command: 'relay --on=stop' }],
};
