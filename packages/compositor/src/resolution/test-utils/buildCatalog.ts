import type { Catalog } from '../../schemas/catalog-schemas.ts';
import { CATALOG_SCHEMA_VERSION } from '../../schemas/catalog-schemas.ts';

/**
 * A small catalog that satisfies both the schema and every consistency invariant.
 *
 * Exercises the shapes a trivial catalog would leave untested: three sources rather than two, so a mis-ordered pair of
 * losers is distinguishable from a reversed one; both layout forms; an artifact two sources shadow; and an artifact the
 * lowest-precedence source wins. Each call returns a fresh structure, so a test may break one field to show that the
 * invariant guarding it holds.
 */
export function buildCatalog(): Catalog {
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    kinds: [
      {
        id: 'collection',
        label: 'Collection',
        emitsFiles: false,
        layout: { form: 'file', root: '.', extension: '.md' },
      },
      {
        id: 'skill',
        label: 'Skill',
        emitsFiles: true,
        layout: { form: 'directory', root: 'skills', entryFile: 'SKILL.md' },
      },
    ],
    sources: [
      {
        id: 'local',
        name: 'local',
        origin: { kind: 'directory', location: './guidance' },
        dir: '/srv/project/guidance',
      },
      { id: 'team', name: 'team', origin: { kind: 'package', location: '@acme/guidance' }, dir: '/srv/team' },
      { id: 'library', name: 'library', origin: { kind: 'directory', location: '/srv/library' }, dir: '/srv/library' },
    ],
    entries: [
      {
        id: 'collection:core',
        kindId: 'collection',
        slug: 'core',
        resolution: {
          winner: { sourceId: 'team', path: 'core.md', hash: 'hash:core' },
          shadowed: [],
        },
      },
      {
        id: 'skill:lint',
        kindId: 'skill',
        slug: 'lint',
        resolution: {
          winner: { sourceId: 'library', path: 'skills/lint/SKILL.md', hash: 'hash:lint' },
          shadowed: [],
        },
      },
      {
        id: 'skill:review',
        kindId: 'skill',
        slug: 'review',
        resolution: {
          winner: { sourceId: 'local', path: 'skills/review/SKILL.md', hash: 'hash:review-local' },
          shadowed: [
            { sourceId: 'team', path: 'skills/review/SKILL.md', hash: 'hash:review-team' },
            { sourceId: 'library', path: 'skills/review/SKILL.md', hash: 'hash:review-library' },
          ],
        },
      },
    ],
  };
}
