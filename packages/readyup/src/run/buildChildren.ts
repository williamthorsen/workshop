import { assertIsBuiltCheckList } from '../kits/assertIsRdyKit.ts';
import type { KitProvenance } from '../kits/KitProvenance.ts';
import type { RdyCheck, RdyCheckBuilder } from '../kits/types.ts';
import { toError } from '../portable/toError.ts';
import type { PragmaLedger } from './PragmaLedger.ts';
import { recordCheckIds } from './recordKitCheckIds.ts';

/**
 * Builds a passed check's dependent checks, records their ids, and returns them, or returns the error that makes the
 * parent an authoring error: a builder that throws, or one that returns anything but valid checks.
 *
 * The runner calls this outside the parent's sweep recorder: A builder decides which checks exist rather than
 * examining sources for findings, and the parent's examined count is settled before it runs.
 */
export async function buildChildren(
  check: RdyCheck & { checks: RdyCheckBuilder },
  ledger: PragmaLedger | undefined,
  provenance: KitProvenance | undefined,
): Promise<readonly RdyCheck[] | Error> {
  try {
    // Called on `check` so that a builder defined as a method keeps its receiver.
    const built: unknown = await check.checks();
    assertIsBuiltCheckList(built);
    if (ledger !== undefined) {
      for (const child of built) recordCheckIds(child, ledger, provenance);
    }
    return built;
  } catch (error_: unknown) {
    return toError(error_);
  }
}
