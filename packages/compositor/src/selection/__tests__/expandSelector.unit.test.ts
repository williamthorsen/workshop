import { describe, expect, it } from 'vitest';

import type { ArtifactId } from '../../schemas/scalar-schemas.ts';
import type { Selector } from '../../schemas/selection-schemas.ts';
import { buildCatalogFromSpec } from '../../test-utils/buildCatalogFromSpec.ts';
import { buildCatalogIndex } from '../buildCatalogIndex.ts';
import { expandSelector } from '../expandSelector.ts';
import type { ConfigEntryRef, SelectionDiagnostic } from '../SelectionDiagnostic.ts';

const index = buildCatalogIndex(
  buildCatalogFromSpec({
    kinds: ['rulebook', 'skill'],
    sources: ['local', 'acme'],
    entries: [
      { kindId: 'skill', slug: 'lint', copySourceIds: ['acme'] },
      { kindId: 'skill', slug: 'format', copySourceIds: ['acme'] },
      { kindId: 'skill', slug: 'review', copySourceIds: ['local', 'acme'] },
      { kindId: 'rulebook', slug: 'house-style', copySourceIds: ['local'] },
    ],
  }),
);
const at: ConfigEntryRef = { tierId: 'project', kindId: 'skill', list: 'use', index: 0 };

describe(expandSelector, () => {
  it('expands a named artifact to its id', () => {
    expect(expand({ artifact: 'lint' }).matched).toStrictEqual(['skill:lint']);
  });

  it('expands a source to every artifact that source contains of the kind', () => {
    expect(expand({ source: 'acme' }).matched.toSorted()).toStrictEqual(['skill:format', 'skill:lint', 'skill:review']);
  });

  it('expands a source to an artifact a higher-precedence source shadows', () => {
    expect(expand({ source: 'local' }).matched).toStrictEqual(['skill:review']);
  });

  it.each([
    ['an artifact no source contains', { artifact: 'absent' }, 'unknown-artifact'],
    ['a source that is not declared', { source: 'nowhere' }, 'unknown-source'],
  ])('matches nothing and reports %s', (_label, selector, code) => {
    const { matched, diagnostics } = expand(selector);

    expect(matched).toStrictEqual([]);
    expect(diagnostics.at(0)?.code).toBe(code);
  });

  it('reports a source containing nothing of the kind, having matched nothing to report', () => {
    const { matched, diagnostics } = expand({ source: 'acme' }, 'rulebook');

    expect(matched).toStrictEqual([]);
    expect(diagnostics.at(0)?.code).toBe('empty-source');
  });

  it('says nothing when the selector matches, so a diagnostic marks a mistake rather than a step', () => {
    expect(expand({ artifact: 'lint' }).diagnostics).toStrictEqual([]);
  });

  it('locates its diagnostic at the config entry it was handed', () => {
    expect(expand({ artifact: 'absent' }).diagnostics.at(0)?.at).toStrictEqual(at);
  });

  it('appends to the diagnostics it is given, so a caller expanding several selectors keeps every one', () => {
    const diagnostics: Array<SelectionDiagnostic> = [];

    expandSelector({ artifact: 'absent' }, 'skill', index, at, diagnostics);
    expandSelector({ artifact: 'missing' }, 'skill', index, at, diagnostics);

    expect(diagnostics).toHaveLength(2);
  });
});

// region | Helpers

/** Expands one selector against the shared index, returning what it matched beside what it reported. */
function expand(
  selector: Selector,
  kindId = 'skill',
): { matched: ReadonlyArray<ArtifactId>; diagnostics: Array<SelectionDiagnostic> } {
  const diagnostics: Array<SelectionDiagnostic> = [];
  const matched = expandSelector(selector, kindId, index, at, diagnostics);

  return { matched, diagnostics };
}

// endregion | Helpers
