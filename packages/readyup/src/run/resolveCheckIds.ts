import type { KitProvenance } from '../kits/KitProvenance.ts';

/** The strings a pragma may write to name one check, and the one printed beside its findings. */
export interface CheckIds {
  printed: string;
  accepted: readonly string[];
}

/**
 * Returns the strings naming a check, or undefined where the check declares no id.
 *
 * A kit a package publishes namespaces its checks under that package's name with the scope stripped, and
 * accepts the fully-qualified name too. The bare id is not accepted there: the namespace is what keeps two
 * kits' same-named checks apart, and accepting the bare form would give that away. Every other provenance,
 * and a kit reached with none, leaves the bare id standing, so the id printed beside a finding is always
 * the id a pragma writes.
 */
export function resolveCheckIds(id: string | undefined, provenance: KitProvenance | undefined): CheckIds | undefined {
  if (id === undefined) return undefined;
  if (provenance?.kind !== 'package') return { accepted: [id], printed: id };

  const printed = `${stripScope(provenance.packageName)}/${id}`;
  const qualified = `${provenance.packageName}/${id}`;
  return { accepted: printed === qualified ? [printed] : [printed, qualified], printed };
}

// region | Helpers

/** Returns a package name without its scope, and an unscoped name unchanged. */
function stripScope(packageName: string): string {
  return packageName.startsWith('@') ? packageName.slice(packageName.indexOf('/') + 1) : packageName;
}

// endregion | Helpers
