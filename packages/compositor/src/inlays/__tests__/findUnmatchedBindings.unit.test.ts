import { describe, expect, it } from 'vitest';

import type { ArtifactRender } from '../../render/renderArtifact.ts';
import type { ArtifactId, TargetId } from '../../schemas/scalar-schemas.ts';
import type { InlayBinding } from '../../selection/selectArtifacts.ts';
import type { BindingDiagnostic } from '../BindingDiagnostic.ts';
import { findUnmatchedBindings } from '../findUnmatchedBindings.ts';

describe(findUnmatchedBindings, () => {
  it('reports a binding whose inlay no artifact declares', () => {
    const found = find({
      bindings: [{ inlayName: 'prefrences', artifactIds: ['rulebook:naming'] }],
      columns: [['claude', [['skill:review', declaring('preferences')]]]],
    });

    expect(found).toStrictEqual([
      {
        code: 'unmatched-inlay',
        message: 'The binding to inlay "prefrences" names an inlay no artifact declares.',
        at: { inlayName: 'prefrences' },
      },
    ]);
  });

  it('reports no binding where an artifact declares the inlay', () => {
    const found = find({
      bindings: [{ inlayName: 'preferences', artifactIds: ['rulebook:naming'] }],
      columns: [['claude', [['skill:review', declaring('preferences')]]]],
    });

    expect(found).toStrictEqual([]);
  });

  // Reporting per target would repeat one config typo across every target, burying the faults a target does own.
  it('reports one binding once, whatever the target count', () => {
    const found = find({
      bindings: [{ inlayName: 'prefrences', artifactIds: ['rulebook:naming'] }],
      columns: [
        ['claude', [['skill:review', declaring('preferences')]]],
        ['rovodev', [['skill:review', declaring('preferences')]]],
      ],
    });

    expect(found).toHaveLength(1);
  });

  it('matches a declaration under any target, one target’s stage recognizing it being enough', () => {
    const found = find({
      bindings: [{ inlayName: 'preferences', artifactIds: ['rulebook:naming'] }],
      columns: [
        ['claude', [['skill:review', declaring()]]],
        ['rovodev', [['skill:review', declaring('preferences')]]],
      ],
    });

    expect(found).toStrictEqual([]);
  });

  it('takes no declaration from an artifact the closure did not reach', () => {
    const found = find({
      bindings: [{ inlayName: 'preferences', artifactIds: ['rulebook:naming'] }],
      columns: [['claude', [['skill:absent', declaring('preferences')]]]],
      reached: [],
    });

    expect(found).toHaveProperty('0.code', 'unmatched-inlay');
  });

  it('reports in the order the bindings run', () => {
    const found = find({
      bindings: [
        { inlayName: 'appendix', artifactIds: ['rulebook:naming'] },
        { inlayName: 'preferences', artifactIds: ['rulebook:naming'] },
      ],
      columns: [['claude', [['skill:review', declaring()]]]],
    });

    expect(found.map(({ at }) => at.inlayName)).toStrictEqual(['appendix', 'preferences']);
  });
});

// region | Helpers

/** Builds a completed render declaring an inlay site per name given. */
function declaring(...names: ReadonlyArray<string>): ArtifactRender {
  return {
    status: 'rendered',
    content: '',
    contributors: { artifacts: [], partials: [] },
    partials: [],
    diagnostics: [],
    inlays: names.map((name, index) => ({ name, insertAt: index })),
  };
}

/** Finds the unmatched bindings among `bindings`, over the columns given and reaching every artifact in them. */
function find(input: {
  bindings: ReadonlyArray<InlayBinding>;
  columns: ReadonlyArray<readonly [TargetId, ReadonlyArray<readonly [ArtifactId, ArtifactRender]>]>;
  reached?: ReadonlyArray<ArtifactId>;
}): Array<BindingDiagnostic> {
  const renders = new Map(input.columns.map(([targetId, column]) => [targetId, new Map(column)]));
  const reached = input.reached ?? input.columns.flatMap(([, column]) => column.map(([artifactId]) => artifactId));

  return findUnmatchedBindings({ bindings: input.bindings, renders, reached: new Set(reached) });
}

// endregion | Helpers
