import { hashUtf8 } from '../portable/hash-content.ts';
import type { Plan } from '../schemas/plan-schema.ts';
import { PLAN_SCHEMA_VERSION } from '../schemas/plan-schema.ts';

const SKILL_BODY = '# Review\n\nRead the diff.\n';

/**
 * The smallest plan that satisfies the contract: one source, one target, one artifact, one added file.
 *
 * A consumer wiring up its first render has something to hold before taking on the representative sample's shapes.
 */
export function buildMinimalSample(): Plan {
  const bodyHash = hashUtf8(SKILL_BODY);
  const configDigest = hashUtf8('codeassembly.yaml');
  const sourceDigest = hashUtf8('source:team');
  const targetDigest = hashUtf8('target:claude');

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    engineVersion: '0.0.0',
    contentAvailability: 'complete',
    fingerprint: {
      config: configDigest,
      sources: [{ sourceId: 'team', digest: sourceDigest }],
      targetState: [{ targetId: 'claude', digest: targetDigest }],
      composite: hashUtf8([configDigest, sourceDigest, targetDigest].join('\n')),
    },
    kinds: [{ id: 'skill', label: 'Skill', emitsFiles: true }],
    sources: [{ id: 'team', name: 'team', origin: { kind: 'directory', location: '/srv/team-guidance' } }],
    targets: [{ id: 'claude', label: 'Claude', root: '~/.claude', tokenMappings: [], variables: [] }],
    tiers: [{ id: 'project', label: 'Project' }],
    artifacts: [
      {
        id: 'skill:review',
        kindId: 'skill',
        slug: 'review',
        status: 'added',
        seededBy: [{ via: 'declaration', tierId: 'project' }],
        dependsOn: [],
        resolution: {
          winner: { sourceId: 'team', path: 'skills/review/SKILL.md', hash: hashUtf8('team/skills/review') },
          shadowed: [],
        },
      },
    ],
    partials: [],
    files: [
      {
        targetId: 'claude',
        path: 'skills/review/SKILL.md',
        status: 'added',
        ownership: { kind: 'full' },
        planned: { hash: bodyHash },
        contributors: { artifacts: [{ artifactId: 'skill:review' }], partials: [] },
      },
    ],
    blobs: { [bodyHash]: { encoding: 'utf8', data: SKILL_BODY } },
  };
}
