import type { KitProvenance } from '../kits/KitProvenance.ts';
import { isFlatChecklist, type RdyCheck, type RdyKit } from '../kits/types.ts';
import type { PragmaLedger } from './PragmaLedger.ts';
import { resolveCheckIds } from './resolveCheckIds.ts';

/**
 * Records the ids of every check of a loaded kit: each checklist's preconditions, then its checks or every staged
 * group, each check followed by its dependents.
 *
 * Every checklist counts, whether or not the invocation selected it, so that a pragma naming a check of a checklist
 * left unrun is not reported as naming a check that does not exist.
 */
export function recordKitCheckIds(kit: RdyKit, ledger: PragmaLedger, provenance: KitProvenance | undefined): void {
  for (const checklist of kit.checklists) {
    const checks = isFlatChecklist(checklist) ? checklist.checks : checklist.groups.flat();
    for (const check of [...(checklist.preconditions ?? []), ...checks]) recordCheckIds(check, ledger, provenance);
  }
}

// region | Helpers

/** Records the ids of a check and of its dependents, depth-first. */
function recordCheckIds(check: RdyCheck, ledger: PragmaLedger, provenance: KitProvenance | undefined): void {
  const ids = resolveCheckIds(check.id, provenance);
  if (ids !== undefined) ledger.recordCheckIds(ids);

  const children = check.checks ?? [];
  for (const child of children) recordCheckIds(child, ledger, provenance);
}

// endregion | Helpers
