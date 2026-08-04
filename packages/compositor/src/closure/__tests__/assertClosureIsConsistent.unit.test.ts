import { describe, expect, it } from 'vitest';

import { ConsistencyError } from '../../consistency/ConsistencyError.ts';
import type { Violation } from '../../consistency/Violation.ts';
import type { Closure } from '../../schemas/closure-schemas.ts';
import { buildClosure } from '../../test-utils/buildClosure.ts';
import { requireEntry } from '../../test-utils/requireEntry.ts';
import { assertClosureIsConsistent, ClosureConsistencyError } from '../assertClosureIsConsistent.ts';

describe(assertClosureIsConsistent, () => {
  it('accepts a closure whose every reference resolves', () => {
    expect(() => assertClosureIsConsistent(buildClosure())).not.toThrow();
  });

  it('if an edge names an artifact the closure does not carry, faults it', () => {
    const closure = buildClosure();
    requireEntry(closure.artifacts, 1).dependsOn = [{ to: 'skill:absent', via: 'declared' }];

    expect(violationsOf(closure)).toStrictEqual([
      {
        path: 'artifacts[1].dependsOn[0].to',
        message: 'references "skill:absent", which is not an entry in artifacts',
      },
    ]);
  });

  it('if a diagnostic is attached to an artifact the closure dropped, faults it', () => {
    const closure = buildClosure();
    requireEntry(closure.diagnostics, 0).at = { artifactId: 'skill:absent' };

    expect(violationsOf(closure)).toStrictEqual([
      {
        path: 'diagnostics[0].at.artifactId',
        message: 'references "skill:absent", which is not an entry in artifacts',
      },
    ]);
  });

  it('if a non-token edge names a partial, faults it, no other origin being read from one', () => {
    const closure = buildClosure();
    requireEntry(closure.artifacts, 2).dependsOn = [
      { to: 'skill:lint', via: 'member', partialId: 'team:_data/shared.md' },
    ];

    expect(violationsOf(closure)).toStrictEqual([
      {
        path: 'artifacts[2].dependsOn[0].partialId',
        message: 'is set on a "member" edge, and only a token edge is read from a partial',
      },
    ]);
  });

  it('if a diagnostic other than a cycle names artifacts, faults it', () => {
    const closure = buildClosure();
    requireEntry(closure.diagnostics, 0).cycle = ['skill:review'];

    expect(violationsOf(closure)).toStrictEqual([
      {
        path: 'diagnostics[0].cycle',
        message: 'is set on a "unknown-reference" diagnostic, and only a dependency cycle runs through artifacts',
      },
    ]);
  });

  it('if a shadowed candidate outranks its winner, faults the ordering', () => {
    const closure = buildClosure();
    requireEntry(closure.artifacts, 1).resolution = {
      winner: { sourceId: 'library', path: 'skills/lint/SKILL.md', hash: 'hash:lint' },
      shadowed: [{ sourceId: 'team', path: 'skills/lint/SKILL.md', hash: 'hash:lint-team' }],
    };

    expect(violationsOf(closure)).toStrictEqual([
      {
        path: 'artifacts[1].resolution.shadowed[0].sourceId',
        message: 'names "team", which does not follow "library" in source precedence order',
      },
    ]);
  });

  it('if one id is carried twice, faults the repeat, which would make every reference to it ambiguous', () => {
    const closure = buildClosure();
    closure.artifacts = [...closure.artifacts, requireEntry(closure.artifacts, 1)];

    expect(violationsOf(closure)).toStrictEqual([
      { path: 'artifacts', message: 'carries "skill:lint" more than once' },
    ]);
  });

  it('throws a consistency error, so a reader validating a plan and a closure together catches one type', () => {
    const closure = buildClosure();
    closure.tiers = [];

    expect(() => assertClosureIsConsistent(closure)).toThrow(ConsistencyError);
  });

  it('reports every fault in one run', () => {
    const closure = buildClosure();
    closure.tiers = [];
    requireEntry(closure.diagnostics, 0).cycle = ['skill:review'];

    expect(violationsOf(closure).map(({ path }) => path)).toStrictEqual([
      'artifacts[0].seededBy[0].tierId',
      'diagnostics[0].cycle',
    ]);
  });
});

// region | Helpers

/** Runs the assertion and returns the violations it raised, failing the test when it raised none. */
function violationsOf(closure: Closure): ReadonlyArray<Violation> {
  try {
    assertClosureIsConsistent(closure);
  } catch (error) {
    if (error instanceof ClosureConsistencyError) {
      return error.violations;
    }
    throw error;
  }
  throw new Error('Expected the assertion to fault, but it accepted the closure.');
}

// endregion | Helpers
