import type { KitProvenance } from '../kits/KitProvenance.ts';

/** The strings that a pragma may write to name one check, the one printed beside its findings, and the declared id. */
export interface CheckIds {
  printed: string;
  accepted: readonly string[];

  /** The id as the check declares it, before any namespace is applied. */
  bare: string;
}

/**
 * Returns the strings naming a check, or `undefined` when the check declares no id.
 *
 * A kit published by a package namespaces its checks under that package's name with the scope stripped, and
 * accepts the fully-qualified name too. The bare id is not accepted there: The namespace keeps two kits'
 * same-named checks apart, and accepting the bare form would undo that. Every other provenance, and a
 * kit reached with none, keeps the bare id, so the id printed beside a finding is always the id
 * written by a pragma.
 *
 * A kit fetched from a repository namespaces its checks under `owner/repo`, and only that form is accepted:
 * Every organization's `.github` repository shares a name, and an ID led by `.` does not parse as a pragma's.
 */
export function resolveCheckIds(id: string | undefined, provenance: KitProvenance | undefined): CheckIds | undefined {
  if (id === undefined) return undefined;
  if (provenance?.kind === 'repository') {
    const printed = `${provenance.owner}/${provenance.repo}/${id}`;
    return { accepted: [printed], bare: id, printed };
  }
  if (provenance?.kind !== 'package') return { accepted: [id], bare: id, printed: id };

  const printed = `${stripScope(provenance.packageName)}/${id}`;
  const qualified = `${provenance.packageName}/${id}`;
  return { accepted: printed === qualified ? [printed] : [printed, qualified], bare: id, printed };
}

// region | Helpers

/** Returns a package name without its scope, and an unscoped name unchanged. */
function stripScope(packageName: string): string {
  return packageName.startsWith('@') ? packageName.slice(packageName.indexOf('/') + 1) : packageName;
}

// endregion | Helpers
