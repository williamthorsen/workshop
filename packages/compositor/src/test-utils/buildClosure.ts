import type { Closure } from '../schemas/closure-schemas.ts';
import { CLOSURE_SCHEMA_VERSION } from '../schemas/closure-schemas.ts';

/**
 * Builds a small closure that satisfies both the schema and every consistency invariant.
 *
 * Exercises the shapes a trivial closure would leave untested: a traversal-only aggregate, an artifact two routes
 * reach, a shadowed candidate, a token edge naming the partial it was read from, a seed naming the tier that decided
 * it, and a diagnostic attached to the artifact responsible. Each call returns a fresh structure, so a test may break
 * one field to show that the invariant guarding it holds.
 */
export function buildClosure(): Closure {
  return {
    schemaVersion: CLOSURE_SCHEMA_VERSION,
    kinds: [
      { id: 'collection', label: 'Collection', emitsFiles: false },
      { id: 'skill', label: 'Skill', emitsFiles: true },
    ],
    sources: [
      { id: 'team', name: 'team', origin: { kind: 'directory', location: '/srv/team' } },
      { id: 'library', name: 'library', origin: { kind: 'directory', location: '/srv/library' } },
    ],
    tiers: [{ id: 'project', label: 'Project' }],
    artifacts: [
      {
        id: 'collection:core',
        kindId: 'collection',
        slug: 'core',
        seededBy: [{ via: 'declaration', tierId: 'project' }],
        dependsOn: [
          { to: 'skill:review', via: 'member' },
          { to: 'skill:lint', via: 'member' },
        ],
        resolution: {
          winner: { sourceId: 'team', path: 'collections/core.md', hash: 'hash:core' },
          shadowed: [],
        },
      },
      {
        id: 'skill:lint',
        kindId: 'skill',
        slug: 'lint',
        seededBy: [],
        dependsOn: [],
        resolution: {
          winner: { sourceId: 'library', path: 'skills/lint/SKILL.md', hash: 'hash:lint' },
          shadowed: [],
        },
      },
      {
        id: 'skill:review',
        kindId: 'skill',
        slug: 'review',
        seededBy: [],
        dependsOn: [{ to: 'skill:lint', via: 'token', partialId: 'team:_data/shared.md' }],
        resolution: {
          winner: { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'hash:review' },
          shadowed: [{ sourceId: 'library', path: 'skills/review/SKILL.md', hash: 'hash:review-library' }],
        },
      },
    ],
    partials: [{ id: 'team:_data/shared.md', sourceId: 'team', path: '_data/shared.md', hash: 'hash:shared' }],
    diagnostics: [
      {
        code: 'unknown-reference',
        message: 'names "skill:absent", which no source carries.',
        at: { artifactId: 'skill:review', key: 'dependencies' },
      },
    ],
  };
}
