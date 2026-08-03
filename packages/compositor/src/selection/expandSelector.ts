import type { Selector } from '../schemas/config-schemas.ts';
import type { ArtifactId, KindId } from '../schemas/scalar-schemas.ts';
import type { CatalogIndex } from './buildCatalogIndex.ts';
import type { ConfigEntryRef, SelectionDiagnostic } from './SelectionDiagnostic.ts';

/** Expands `selector` to the artifacts it names, appending a diagnostic and matching nothing when it names none. */
export function expandSelector(
  selector: Selector,
  kindId: KindId,
  index: CatalogIndex,
  at: ConfigEntryRef,
  diagnostics: Array<SelectionDiagnostic>,
): ReadonlyArray<ArtifactId> {
  if ('artifact' in selector) {
    const artifactId = index.bySlug.get(kindId)?.get(selector.artifact);
    if (artifactId === undefined) {
      diagnostics.push({
        code: 'unknown-artifact',
        message: `No source carries "${selector.artifact}" of kind "${kindId}".`,
        at,
      });
      return [];
    }
    return [artifactId];
  }

  if (!index.sourceIds.has(selector.source)) {
    diagnostics.push({ code: 'unknown-source', message: `Source "${selector.source}" is not declared.`, at });
    return [];
  }

  const carried = index.bySource.get(kindId)?.get(selector.source) ?? [];
  if (carried.length === 0) {
    diagnostics.push({
      code: 'empty-source',
      message: `Source "${selector.source}" carries nothing of kind "${kindId}".`,
      at,
    });
  }
  return carried;
}
