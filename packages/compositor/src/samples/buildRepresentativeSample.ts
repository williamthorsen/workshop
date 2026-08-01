import { Buffer } from 'node:buffer';

import type { Hash } from '../schemas/common.ts';
import type { Blob, FileSide } from '../schemas/fileSchemas.ts';
import type { Plan } from '../schemas/planSchema.ts';
import { SCHEMA_VERSION } from '../schemas/planSchema.ts';
import { hashBytes, hashUtf8 } from './hashContent.ts';

const REGION_OPEN = '<!-- ambient:start -->';
const REGION_CLOSE = '<!-- ambient:end -->';

const CLAUDE_MD_CURRENT = `# Guidance\n\n${REGION_OPEN}\n<!-- rulebook:style -->\nUse sentence case.\n<!-- /rulebook:style -->\n${REGION_CLOSE}\n`;
const CLAUDE_MD_PLANNED = `# Guidance\n\n${REGION_OPEN}\n<!-- rulebook:naming -->\nName functions with a leading verb.\n<!-- /rulebook:naming -->\n\n<!-- rulebook:style -->\nUse sentence case.\n<!-- /rulebook:style -->\n\n<!-- rulebook:tests -->\nName tests for the behavior they pin.\n<!-- /rulebook:tests -->\n${REGION_CLOSE}\n`;

const REVIEW_SKILL_CURRENT = '# Review\n\nRead the diff.\n';
const REVIEW_SKILL_PLANNED = '# Review\n\nRead the diff, then the tests.\n';
const RETIRED_SKILL_CURRENT = '# Retired\n\nSuperseded.\n';
const LINT_SKILL = '# Lint\n\nRun the linter.\n';
// The first hook belongs to another tool and carries no sentinel; the engine owns only the entries marked with one.
const SETTINGS_JSON_CURRENT =
  '{\n  "hooks": [\n    { "command": "vendor-tool sync" },\n    { "command": "relay --on=stop", "source": "codeassembly" }\n  ]\n}\n';
const SETTINGS_JSON_PLANNED =
  '{\n  "hooks": [\n    { "command": "vendor-tool sync" },\n    { "command": "relay --on=stop", "source": "codeassembly" },\n    { "command": "relay --on=review", "source": "codeassembly" }\n  ]\n}\n';
const AUDITOR_CURRENT = '# Auditor\n\nAudit the change.\n';
const AUDITOR_PLANNED = '# Auditor\n\nAudit the change against its ticket.\n';

// A PNG signature stands in for a skill asset the engine copies byte for byte.
const DIAGRAM_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

/**
 * A plan exercising every shape the contract has to carry.
 *
 * Modelled on a guidance-distribution run: three precedence-ordered sources feeding two targets, with an artifact
 * reached by three routes, an artifact shadowing two losers beside one the lowest-precedence source wins, three
 * rulebooks aggregated into one region with per-artifact markers, entry-level ownership of a structured config, a
 * byte-copied asset, a file apply will skip, and all four diff statuses.
 *
 * Tables are authored in the order the contract documents: id-keyed tables lexicographically, files by target then
 * path, and `sources` and each `shadowed` list in precedence order, where the order is the meaning.
 */
export function buildRepresentativeSample(): Plan {
  const blobs = new Map<Hash, Blob>();

  const files = [
    {
      targetId: 'claude',
      path: 'CLAUDE.md',
      status: 'changed' as const,
      ownership: { kind: 'region' as const, open: REGION_OPEN, close: REGION_CLOSE },
      current: addUtf8(blobs, CLAUDE_MD_CURRENT),
      planned: addUtf8(blobs, CLAUDE_MD_PLANNED),
      contributors: {
        artifacts: [
          {
            artifactId: 'rulebook:naming',
            marker: { open: '<!-- rulebook:naming -->', close: '<!-- /rulebook:naming -->' },
          },
          {
            artifactId: 'rulebook:style',
            marker: { open: '<!-- rulebook:style -->', close: '<!-- /rulebook:style -->' },
          },
          {
            artifactId: 'rulebook:tests',
            marker: { open: '<!-- rulebook:tests -->', close: '<!-- /rulebook:tests -->' },
          },
        ],
        partials: [],
      },
    },
    {
      targetId: 'claude',
      path: 'settings.json',
      status: 'changed' as const,
      ownership: { kind: 'entries' as const, sentinel: 'codeassembly', format: 'json' as const },
      current: addUtf8(blobs, SETTINGS_JSON_CURRENT),
      planned: addUtf8(blobs, SETTINGS_JSON_PLANNED),
      contributors: { artifacts: [{ artifactId: 'skill:review' }], partials: [] },
    },
    {
      targetId: 'claude',
      path: 'skills/lint/SKILL.md',
      status: 'unchanged' as const,
      ownership: { kind: 'full' as const },
      current: addUtf8(blobs, LINT_SKILL),
      planned: addUtf8(blobs, LINT_SKILL),
      contributors: { artifacts: [{ artifactId: 'skill:lint' }], partials: [] },
    },
    {
      targetId: 'claude',
      path: 'skills/retired/SKILL.md',
      status: 'removed' as const,
      ownership: { kind: 'full' as const },
      current: addUtf8(blobs, RETIRED_SKILL_CURRENT),
      contributors: { artifacts: [{ artifactId: 'skill:retired' }], partials: [] },
    },
    {
      targetId: 'claude',
      path: 'skills/review/SKILL.md',
      status: 'changed' as const,
      ownership: { kind: 'full' as const },
      current: addUtf8(blobs, REVIEW_SKILL_CURRENT),
      planned: addUtf8(blobs, REVIEW_SKILL_PLANNED),
      contributors: { artifacts: [{ artifactId: 'skill:review' }], partials: ['team:_data/shared.md'] },
    },
    {
      targetId: 'claude',
      path: 'skills/review/diagram.png',
      status: 'added' as const,
      ownership: { kind: 'full' as const },
      planned: addBytes(blobs, DIAGRAM_BYTES),
      contributors: { artifacts: [{ artifactId: 'skill:review' }], partials: [] },
    },
    {
      targetId: 'rovodev',
      path: 'subagents/auditor.md',
      status: 'changed' as const,
      ownership: { kind: 'full' as const },
      blocked: { reason: 'the destination is owned by another tool' },
      current: addUtf8(blobs, AUDITOR_CURRENT),
      planned: addUtf8(blobs, AUDITOR_PLANNED),
      contributors: { artifacts: [{ artifactId: 'subagent:auditor' }], partials: ['team:_data/shared.md'] },
    },
  ];

  const configDigest = hashUtf8('codeassembly.yaml');
  const sourceDigests = [
    { sourceId: 'team', digest: hashUtf8('source:team') },
    { sourceId: 'packaged', digest: hashUtf8('source:packaged') },
    { sourceId: 'library', digest: hashUtf8('source:library') },
  ];
  const targetDigests = [
    { targetId: 'claude', digest: hashUtf8('target:claude') },
    { targetId: 'rovodev', digest: hashUtf8('target:rovodev') },
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: '0.0.0',
    contentAvailability: 'complete',
    fingerprint: {
      config: configDigest,
      sources: sourceDigests,
      targetState: targetDigests,
      composite: hashUtf8(
        [configDigest, ...sourceDigests.map((s) => s.digest), ...targetDigests.map((t) => t.digest)].join('\n'),
      ),
    },
    kinds: [
      { id: 'collection', label: 'Collection', emitsFiles: false },
      { id: 'rulebook', label: 'Rulebook', emitsFiles: true },
      { id: 'skill', label: 'Skill', emitsFiles: true },
      { id: 'subagent', label: 'Subagent', emitsFiles: true },
    ],
    sources: [
      { id: 'team', name: 'team', origin: { kind: 'directory', location: '/srv/team-guidance' } },
      { id: 'packaged', name: 'packaged', origin: { kind: 'package', location: '@acme/guidance' } },
      { id: 'library', name: 'library', origin: { kind: 'directory', location: '/opt/compositor/library' } },
    ],
    targets: [
      {
        id: 'claude',
        label: 'Claude',
        root: '~/.claude',
        tokenMappings: [
          {
            kindId: 'tool',
            entries: [
              { from: 'Edit', to: 'Edit' },
              { from: 'Read', to: 'Read' },
            ],
          },
        ],
        variables: [
          { name: 'guidanceFile', value: 'CLAUDE.md' },
          { name: 'skillSigil', value: '/' },
        ],
      },
      {
        id: 'rovodev',
        label: 'Rovo Dev',
        root: '~/.rovodev',
        tokenMappings: [
          {
            kindId: 'tool',
            entries: [
              { from: 'Edit', to: 'edit_file' },
              { from: 'Read', to: 'open_files' },
            ],
          },
        ],
        variables: [
          { name: 'guidanceFile', value: 'AGENTS.md' },
          { name: 'skillSigil', value: '!' },
        ],
      },
    ],
    artifacts: [
      {
        id: 'collection:core',
        kindId: 'collection',
        slug: 'core',
        status: 'unchanged',
        seededBy: ['declaration'],
        dependsOn: [
          { to: 'rulebook:style', via: 'member' },
          { to: 'skill:review', via: 'member' },
          { to: 'skill:lint', via: 'member' },
        ],
        resolution: {
          winner: { sourceId: 'team', path: 'collections/core.md', hash: hashUtf8('collections/core.md') },
          shadowed: [],
        },
      },
      {
        id: 'rulebook:naming',
        kindId: 'rulebook',
        slug: 'naming',
        status: 'added',
        seededBy: ['package-catalog'],
        dependsOn: [],
        resolution: {
          winner: { sourceId: 'packaged', path: 'rulebooks/naming.md', hash: hashUtf8('rulebooks/naming.md') },
          shadowed: [],
        },
      },
      {
        id: 'rulebook:style',
        kindId: 'rulebook',
        slug: 'style',
        status: 'unchanged',
        seededBy: [],
        dependsOn: [],
        resolution: {
          winner: { sourceId: 'team', path: 'rulebooks/style.md', hash: hashUtf8('rulebooks/style.md') },
          shadowed: [],
        },
      },
      {
        id: 'rulebook:tests',
        kindId: 'rulebook',
        slug: 'tests',
        status: 'added',
        seededBy: ['package-catalog'],
        dependsOn: [],
        resolution: {
          winner: { sourceId: 'packaged', path: 'rulebooks/tests.md', hash: hashUtf8('rulebooks/tests.md') },
          shadowed: [],
        },
      },
      {
        id: 'skill:lint',
        kindId: 'skill',
        slug: 'lint',
        status: 'unchanged',
        seededBy: [],
        dependsOn: [],
        resolution: {
          winner: { sourceId: 'library', path: 'skills/lint/SKILL.md', hash: hashUtf8('library/skills/lint') },
          shadowed: [],
        },
      },
      {
        id: 'skill:retired',
        kindId: 'skill',
        slug: 'retired',
        status: 'removed',
        dependsOn: [],
        resolution: {
          winner: { sourceId: 'team', path: 'skills/retired/SKILL.md', hash: hashUtf8('team/skills/retired') },
          shadowed: [],
        },
      },
      {
        id: 'skill:review',
        kindId: 'skill',
        slug: 'review',
        status: 'changed',
        seededBy: [],
        dependsOn: [{ to: 'skill:lint', via: 'token', partialId: 'team:_data/shared.md' }],
        resolution: {
          winner: { sourceId: 'team', path: 'skills/review/SKILL.md', hash: hashUtf8('team/skills/review') },
          shadowed: [
            { sourceId: 'packaged', path: 'skills/review/SKILL.md', hash: hashUtf8('packaged/skills/review') },
            { sourceId: 'library', path: 'skills/review/SKILL.md', hash: hashUtf8('library/skills/review') },
          ],
        },
      },
      {
        id: 'subagent:auditor',
        kindId: 'subagent',
        slug: 'auditor',
        status: 'changed',
        seededBy: ['declaration'],
        dependsOn: [{ to: 'skill:review', via: 'injected' }],
        resolution: {
          winner: { sourceId: 'team', path: 'subagents/auditor.md', hash: hashUtf8('subagents/auditor.md') },
          shadowed: [],
        },
      },
    ],
    partials: [
      {
        id: 'team:_data/shared.md',
        sourceId: 'team',
        path: '_data/shared.md',
        hash: hashUtf8('team/_data/shared.md'),
      },
    ],
    files,
    blobs: Object.fromEntries([...blobs].toSorted(([left], [right]) => (left < right ? -1 : 1))),
  };
}

// region | Helpers

/** Registers `data` as a byte-encoded blob and returns the file side naming it. */
function addBytes(blobs: Map<Hash, Blob>, data: Uint8Array): FileSide {
  const hash = hashBytes(data);
  blobs.set(hash, { encoding: 'base64', data: Buffer.from(data).toString('base64') });
  return { hash };
}

/** Registers `data` as a UTF-8 blob and returns the file side naming it. */
function addUtf8(blobs: Map<Hash, Blob>, data: string): FileSide {
  const hash = hashUtf8(data);
  blobs.set(hash, { encoding: 'utf8', data });
  return { hash };
}

// endregion | Helpers
