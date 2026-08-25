import type { BlobStore } from '../../portable/createBlobStore.ts';
import type { FileEntry } from '../../schemas/file-schemas.ts';
import {
  AUDITOR_CURRENT,
  AUDITOR_PLANNED,
  CLAUDE_MD_CURRENT,
  CLAUDE_MD_PLANNED,
  DIAGRAM_BYTES,
  FILL_CLOSE,
  FILL_OPEN,
  LINT_SKILL,
  REGION_CLOSE,
  REGION_OPEN,
  RETIRED_SKILL_CURRENT,
  REVIEW_SKILL_CURRENT,
  REVIEW_SKILL_PLANNED,
  SETTINGS_JSON_CURRENT,
  SETTINGS_JSON_PLANNED,
} from './file-bodies.ts';

/**
 * Builds the files the representative sample plans, ordered by target and then by path.
 *
 * Registers each side's body in `blobs`, so the store holds every body the returned files name.
 */
export function buildFiles(blobs: BlobStore): Array<FileEntry> {
  return [
    {
      targetId: 'claude',
      path: 'CLAUDE.md',
      status: 'changed',
      ownership: { kind: 'region', open: REGION_OPEN, close: REGION_CLOSE },
      current: blobs.addUtf8(CLAUDE_MD_CURRENT),
      planned: blobs.addUtf8(CLAUDE_MD_PLANNED),
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
      status: 'changed',
      ownership: {
        kind: 'entries',
        format: 'json',
        collections: [{ path: ['hooks'], sentinel: { path: ['source'], value: 'codeassembly' } }],
      },
      current: blobs.addUtf8(SETTINGS_JSON_CURRENT),
      planned: blobs.addUtf8(SETTINGS_JSON_PLANNED),
      // Nothing artifact-shaped reaches an entries host: a target declares its items, and no kind routes there.
      contributors: { artifacts: [], partials: [] },
    },
    {
      targetId: 'claude',
      path: 'skills/lint/SKILL.md',
      status: 'unchanged',
      ownership: { kind: 'full' },
      current: blobs.addUtf8(LINT_SKILL),
      planned: blobs.addUtf8(LINT_SKILL),
      contributors: { artifacts: [{ artifactId: 'skill:lint' }], partials: [] },
    },
    {
      targetId: 'claude',
      path: 'skills/retired/SKILL.md',
      status: 'removed',
      ownership: { kind: 'full' },
      current: blobs.addUtf8(RETIRED_SKILL_CURRENT),
      contributors: { artifacts: [{ artifactId: 'skill:retired' }], partials: [] },
    },
    {
      targetId: 'claude',
      path: 'skills/review/SKILL.md',
      status: 'changed',
      ownership: { kind: 'full' },
      current: blobs.addUtf8(REVIEW_SKILL_CURRENT),
      planned: blobs.addUtf8(REVIEW_SKILL_PLANNED),
      contributors: {
        artifacts: [
          { artifactId: 'skill:review' },
          { artifactId: 'rulebook:naming', marker: { open: FILL_OPEN, close: FILL_CLOSE } },
        ],
        partials: ['team:_data/shared.md'],
      },
    },
    {
      targetId: 'claude',
      path: 'skills/review/diagram.png',
      status: 'added',
      ownership: { kind: 'full' },
      planned: blobs.addBytes(DIAGRAM_BYTES),
      contributors: { artifacts: [{ artifactId: 'skill:review' }], partials: [] },
    },
    {
      targetId: 'rovodev',
      path: 'subagents/auditor.md',
      status: 'changed',
      ownership: { kind: 'full' },
      blocked: { reason: 'the destination is owned by another tool' },
      current: blobs.addUtf8(AUDITOR_CURRENT),
      planned: blobs.addUtf8(AUDITOR_PLANNED),
      contributors: { artifacts: [{ artifactId: 'subagent:auditor' }], partials: ['team:_data/shared.md'] },
    },
  ];
}
