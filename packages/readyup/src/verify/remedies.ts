import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import type { DriftStatus } from './checkDrift.ts';
import type { InputFailure, InputsStatus } from './checkInputDrift.ts';
import type { RebuildStatus } from './checkRebuild.ts';
import type { SourceStatus } from './checkSourceDrift.ts';
import type { KitVerdicts } from './verdicts.ts';
import { hasSourceFailed, hasTargetFailed } from './verdicts.ts';

/**
 * The remedy for everything a plain recompile settles.
 *
 * Shared by four verdicts, so a kit failing several of them names the command once rather than
 * repeating it per axis. Worded as `rdy run` words the same advice, which it gives on three of
 * these verdicts where this command enforces.
 */
const RECOMPILE = 'Run `rdy compile` to rebuild it.';

/**
 * Returns what to do about a kit's failing verdicts, in axis order and without repetition.
 *
 * Keyed on the whole verdict set rather than one verdict at a time, because a drifted target's
 * remedy depends on what the rebuild found: a bundle that reproduces byte for byte has nothing to
 * move into the source, and it is the recorded hash that needs rewriting.
 *
 * A passing or `unverified` verdict contributes nothing, so a kit that fails no axis gets an empty
 * list.
 */
export function resolveRemedies(kit: RdyManifestKit, verdicts: KitVerdicts): string[] {
  const { drift, inputs, rebuild, source } = verdicts;
  const remedies = [
    resolveDriftRemedy(drift, rebuild),
    resolveSourceRemedy(kit, source),
    ...resolveInputRemedies(inputs),
    resolveRebuildRemedy(rebuild, drift, source),
  ].filter((remedy): remedy is string => remedy !== undefined);

  return [...new Set(remedies)];
}

// region | Helpers

/**
 * Returns the remedy for the compiled-output verdict, or `undefined` where there is nothing to fix.
 *
 * Both `drift` branches name `--force`, because `rdy compile` gates on drift and skips the kit
 * rather than overwriting it. They differ in whether there are edits to move first, which is the
 * question `--rebuild` answers. A missing bundle does not hit that gate, so a plain recompile
 * regenerates it.
 */
function resolveDriftRemedy(status: DriftStatus, rebuild: RebuildStatus | undefined): string | undefined {
  switch (status.kind) {
    case 'ok':
    case 'unverified':
      return undefined;
    case 'drift':
      return rebuild?.kind === 'ok'
        ? 'The bundle reproduces, so its recorded hash is what is stale. Run `rdy compile --force` to re-record it.'
        : 'Move the edits into the source, then run `rdy compile --force`.';
    case 'missing':
      return RECOMPILE;
  }
}

/** Returns the remedy for one input the compile read that no longer matches what it read. */
function resolveInputFailureRemedy(failure: InputFailure): string {
  switch (failure.reason) {
    case 'changed':
      return RECOMPILE;
    case 'missing':
      return `Restore ${failure.path}, or run \`rdy compile\` if the kit no longer reads it.`;
    case 'unprojectable':
      return `Restore the picked fields in ${failure.path}, or repoint the kit's \`pickJson\` call.`;
  }
}

/**
 * Returns one remedy per failing input, and none where the verdict is `ok` or `unverified`.
 *
 * Ten inputs failing for one reason collapse to one remedy, since the caller deduplicates.
 */
function resolveInputRemedies(status: InputsStatus): string[] {
  return status.kind === 'stale' ? status.failures.map(resolveInputFailureRemedy) : [];
}

/**
 * Returns the remedy for the rebuild verdict, or `undefined` where there is nothing to add.
 *
 * `mismatch` and `missing` both speak about a file another axis may own, and stay silent where it
 * does. A drifted target is the case that matters: the bundle was edited by hand, and the plain
 * recompile a mismatch would prescribe is the one command the drift gate refuses to run. `missing`
 * additionally defers to a vanished source, leaving a recompile to fill in a manifest entry that
 * records no source or no compiled path, which is the only reason no other axis reports.
 *
 * `failed` always speaks. It is about the source rather than the bundle, and a kit that no longer
 * compiles has to be fixed before any remedy naming a recompile can be carried out.
 */
function resolveRebuildRemedy(
  status: RebuildStatus | undefined,
  drift: DriftStatus,
  source: SourceStatus,
): string | undefined {
  if (status === undefined) return undefined;

  switch (status.kind) {
    case 'ok':
      return undefined;
    case 'mismatch':
      return hasTargetFailed(drift) ? undefined : RECOMPILE;
    case 'failed':
      return 'Fix the kit source so it compiles.';
    case 'missing':
      return hasTargetFailed(drift) || hasSourceFailed(source) ? undefined : RECOMPILE;
  }
}

/**
 * Returns the remedy for the source verdict, or `undefined` where there is nothing to fix.
 *
 * A recompile is what drops a vanished kit from the manifest, because the sweep rewrites the whole
 * file from the sources it finds; nobody edits the entry out by hand.
 */
function resolveSourceRemedy(kit: RdyManifestKit, status: SourceStatus): string | undefined {
  switch (status.kind) {
    case 'ok':
    case 'unverified':
      return undefined;
    case 'stale':
      return RECOMPILE;
    case 'missing':
      return kit.source === undefined
        ? RECOMPILE
        : `Restore ${kit.source}, or run \`rdy compile\` to drop the kit from the manifest.`;
  }
}

// endregion | Helpers
