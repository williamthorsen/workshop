import type { KindDescriptor } from '../../schemas/descriptor-schemas.ts';
import type { OwnedItemsDeclaration } from '../../schemas/owned-items-schemas.ts';
import type { RenderTarget } from '../../schemas/render-target-schemas.ts';

/** The kinds every sample target deploys. */
export const SAMPLE_KINDS: ReadonlyArray<KindDescriptor> = [
  { id: 'rulebook', label: 'Rulebook', emitsFiles: true },
  { id: 'skill', label: 'Skill', emitsFiles: true },
];

export const SKILL_DEPLOYMENT = {
  form: 'tree',
  kindId: 'skill',
  layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
} as const;

export const AMBIENT_DEPLOYMENT = {
  form: 'region',
  kindId: 'rulebook',
  host: 'CLAUDE.md',
  markers: { open: '<!-- codeassembly -->', close: '<!-- /codeassembly -->' },
  contributionMarkers: { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' },
} as const;

export const INLAY_STAGE = {
  kind: 'inlay',
  syntax: { open: '<!--', close: '-->' },
  markers: { open: '<!-- inlay:{inlayName}:start -->', close: '<!-- inlay:{inlayName}:end -->' },
  contributionMarkers: { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' },
  reshape: { pattern: String.raw`^(#{1,5})(?=\s)`, replacement: '$1#' },
} as const;

export const SETTINGS_HOOKS: OwnedItemsDeclaration = {
  format: 'json',
  collection: ['hooks'],
  sentinel: { path: ['source'], value: 'codeassembly' },
  host: 'settings.json',
  items: [{ command: 'relay --on=stop' }],
};

/** A target consistent on its own, which each case varies to introduce one fault. */
export const CLAUDE_TARGET: RenderTarget = {
  id: 'claude',
  label: 'Claude',
  root: '~/.claude',
  tokenMappings: [],
  deployments: [SKILL_DEPLOYMENT],
  stages: [{ kind: 'tokens' }, { kind: 'links', pattern: String.raw`\[[^\]]*\]\(([^)]+)\)` }],
};
