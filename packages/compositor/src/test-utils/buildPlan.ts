import type { Plan } from '../schemas/plan-schema.ts';
import { PLAN_SCHEMA_VERSION } from '../schemas/plan-schema.ts';

/**
 * A small plan that satisfies both the schema and every consistency invariant.
 *
 * Exercises the shapes a trivial plan would leave untested: a traversal-only kind, an artifact reached through a
 * dependency edge, a shadowed candidate, a transcluded partial, and a file whose two sides differ. Each call returns a
 * fresh structure, so a test may break one field to show that the invariant guarding it holds.
 */
export function buildPlan(): Plan {
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    engineVersion: '0.0.0',
    contentAvailability: 'complete',
    fingerprint: {
      config: 'hash:config',
      sources: [
        { sourceId: 'team', digest: 'hash:source-team' },
        { sourceId: 'library', digest: 'hash:source-library' },
      ],
      targetState: [{ targetId: 'claude', digest: 'hash:target-claude' }],
      composite: 'hash:composite',
    },
    kinds: [
      { id: 'collection', label: 'Collection', emitsFiles: false },
      { id: 'skill', label: 'Skill', emitsFiles: true },
    ],
    sources: [
      { id: 'team', name: 'team', origin: { kind: 'directory', location: '/srv/team' } },
      { id: 'library', name: 'library', origin: { kind: 'directory', location: '/srv/library' } },
    ],
    targets: [
      {
        id: 'claude',
        label: 'Claude',
        root: '~/.claude',
        tokenMappings: [{ kindId: 'tool', entries: [{ from: 'Read', to: 'view' }] }],
        variables: [{ name: 'homeDir', value: '.claude' }],
      },
    ],
    artifacts: [
      {
        id: 'collection:core',
        kindId: 'collection',
        slug: 'core',
        status: 'unchanged',
        seededBy: ['declaration'],
        dependsOn: [{ to: 'skill:review', via: 'member' }],
        resolution: {
          winner: { sourceId: 'team', path: 'collections/core.md', hash: 'hash:core' },
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
          winner: { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'hash:review' },
          shadowed: [{ sourceId: 'library', path: 'skills/review/SKILL.md', hash: 'hash:review-library' }],
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
          winner: { sourceId: 'library', path: 'skills/lint/SKILL.md', hash: 'hash:lint' },
          shadowed: [],
        },
      },
    ],
    partials: [{ id: 'team:_data/shared.md', sourceId: 'team', path: '_data/shared.md', hash: 'hash:shared' }],
    files: [
      {
        targetId: 'claude',
        path: 'skills/review/SKILL.md',
        status: 'changed',
        ownership: { kind: 'full' },
        current: { hash: 'hash:review-current' },
        planned: { hash: 'hash:review-planned' },
        contributors: { artifacts: [{ artifactId: 'skill:review' }], partials: ['team:_data/shared.md'] },
      },
    ],
    blobs: {
      'hash:review-current': { encoding: 'utf8', data: '# Review\n' },
      'hash:review-planned': { encoding: 'utf8', data: '# Review\n\nUpdated.\n' },
    },
  };
}
