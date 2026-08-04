import type { ResolveKind } from '../../schemas/catalog-schemas.ts';

/**
 * The kinds the closure tests are written against.
 *
 * Covers what the flow has to tell apart: an aggregate that takes part in the graph without producing output, a kind
 * laid out as a directory per artifact, and a kind laid out as a file per artifact.
 */
export const SAMPLE_KINDS: ReadonlyArray<ResolveKind> = [
  {
    id: 'collection',
    label: 'Collection',
    emitsFiles: false,
    layout: { form: 'file', root: 'collections', extension: '.md' },
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
