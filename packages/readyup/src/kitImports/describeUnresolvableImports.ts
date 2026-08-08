import type { KitProvenance } from '../KitProvenance.ts';
import { VERSION } from '../version.ts';
import type { UnresolvableImports } from './UnresolvableKitImportsError.ts';

/** What a failing kit is called and where it came from, which together decide how the failure reads. */
export interface UnresolvableImportsContext {
  kitName: string;
  provenance?: KitProvenance | undefined;
}

/** A composed diagnosis: what went wrong, and the one action that clears it. */
export interface UnresolvableImportsDiagnosis {
  message: string;
  hint: string;
}

/**
 * Composes the failure a kit's unresolvable readyup imports produce.
 *
 * The message names the kit, and the publishing package where the kit has one, because a `--packages` run loads
 * several kits that share the name `default` and a message read on its own has to say which one failed.
 *
 * The remedy follows the kit's source, since the action that clears the failure differs by where the bundle is
 * maintained: a kit in the project can be recompiled, a kit inside an installed package cannot.
 */
export function describeUnresolvableImports(
  findings: UnresolvableImports,
  context: UnresolvableImportsContext,
): UnresolvableImportsDiagnosis {
  const clauses = [
    ...findings.missing.map(({ specifier, names }) => `${specifier} does not export ${names.join(', ')}`),
    ...findings.unknownSubpaths.map((subpath) => `${subpath} is not a subpath it publishes`),
  ];

  return {
    message: `kit "${context.kitName}"${describeOwner(context.provenance)} cannot run against readyup ${VERSION}: ${clauses.join('; ')}.`,
    hint: describeRemedy(context.provenance),
  };
}

// region | Helpers

/** Names the package publishing a kit, for the provenance that has one. */
function describeOwner(provenance: KitProvenance | undefined): string {
  return provenance?.kind === 'package' ? ` from ${provenance.packageName}` : '';
}

/** Gives the one action that puts a kit back in reach of the running readyup. */
function describeRemedy(provenance: KitProvenance | undefined): string {
  if (provenance === undefined) return `Run 'rdy compile' to rebuild it against readyup ${VERSION}.`;
  if (provenance.kind === 'package') {
    return `Upgrade ${provenance.packageName} to a release compiled against readyup ${VERSION}.`;
  }
  if (provenance.kind === 'remote') {
    return `Ask the publisher of ${provenance.label} to recompile it against readyup ${VERSION}.`;
  }
  return `Run 'rdy compile' in the project that owns ${provenance.label}.`;
}

// endregion | Helpers
