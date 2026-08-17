import { hashUtf8 } from '../../portable/hash-content.ts';
import type { ArtifactEntry } from '../../schemas/graph-schemas.ts';

/**
 * Builds the artifacts the representative sample resolves, in lexicographic id order.
 *
 * Each `shadowed` list runs in precedence order, so the candidate the winner displaced first comes first.
 */
export function buildArtifacts(): Array<ArtifactEntry> {
  return [
    {
      id: 'collection:core',
      kindId: 'collection',
      slug: 'core',
      status: 'unchanged',
      seededBy: [
        { via: 'declaration', tierId: 'user' },
        { via: 'declaration', tierId: 'project' },
      ],
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
      seededBy: [
        { via: 'source-catalog', tierId: 'project' },
        { via: 'binding', tierId: 'project' },
      ],
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
      seededBy: [{ via: 'source-catalog', tierId: 'project' }],
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
      seededBy: [{ via: 'declaration', tierId: 'user' }],
      dependsOn: [{ to: 'skill:review', via: 'injected' }],
      resolution: {
        winner: { sourceId: 'team', path: 'subagents/auditor.md', hash: hashUtf8('subagents/auditor.md') },
        shadowed: [],
      },
    },
  ];
}
