import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { MOVE_EDITS_REMEDY, RECOMPILE_REMEDY } from '../reporting/remedies.ts';
import type { DriftStatus } from './checkDrift.ts';
import type { InputFailure, InputsStatus } from './checkInputDrift.ts';
import type { RebuildStatus } from './checkRebuild.ts';
import type { SourceStatus } from './checkSourceDrift.ts';
import type { KitVerdicts } from './verdicts.ts';
import { hasSourceFailed, hasTargetFailed } from './verdicts.ts';

/** One thing to do about a kit, and the file it speaks for where it speaks for one. */
interface Remedy {
  path?: string;
  text: string;
}

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
  const raised = [
    resolveDriftRemedy(drift, rebuild),
    resolveSourceRemedy(kit, source),
    ...resolveInputRemedies(inputs),
    resolveRebuildRemedy(rebuild, drift, source),
  ].filter((remedy): remedy is Remedy => remedy !== undefined);

  return collapseRemedies(raised, drift.kind === 'drift');
}

// region | Helpers

/**
 * Returns the remedies a reader can act on, in the order the axes raised them.
 *
 * Two rules, each collapsing a pair the axes reach independently and neither able to see. A file
 * more than one axis names is remedied once, by the axis that spoke first, which is the one holding
 * the more exact account of it: a kit's own source is recorded among its inputs, so deleting it
 * fails both axes on one path and only the source axis knows the file is the kit's entry.
 *
 * A bare recompile is dropped wherever the target has drifted, because `rdy compile` refuses a
 * drifted kit and exits non-zero. The `--force` remedy the drift verdict raised is then the only
 * command that runs, and it recompiles from the same source, so it settles whatever the dropped
 * remedy was raised for. Drift alone gates this: a bundle that is merely gone recompiles normally,
 * and its own remedy is the bare recompile.
 */
function collapseRemedies(raised: Remedy[], targetDrifted: boolean): string[] {
  const spokenFor = new Set<string>();
  const texts: string[] = [];

  for (const { path, text } of raised) {
    if (path !== undefined && spokenFor.has(path)) continue;
    if (targetDrifted && text === RECOMPILE_REMEDY) continue;
    if (path !== undefined) spokenFor.add(path);
    texts.push(text);
  }

  return [...new Set(texts)];
}

/**
 * Returns the remedy for the compiled-output verdict, or `undefined` where there is nothing to fix.
 *
 * Both `drift` branches name `--force`, because `rdy compile` gates on drift and skips the kit
 * rather than overwriting it. They differ in whether there are edits to move first, which is the
 * question `--rebuild` answers. A missing bundle does not hit that gate, so a plain recompile
 * regenerates it.
 */
function resolveDriftRemedy(status: DriftStatus, rebuild: RebuildStatus | undefined): Remedy | undefined {
  switch (status.kind) {
    case 'ok':
    case 'unverified':
      return undefined;
    case 'drift':
      return {
        text:
          rebuild?.kind === 'ok'
            ? 'The bundle reproduces, so its recorded hash is what is stale. Run `rdy compile --force` to re-record it.'
            : MOVE_EDITS_REMEDY,
      };
    case 'missing':
      return { text: RECOMPILE_REMEDY };
  }
}

/** Returns the remedy for one input the compile read that no longer matches what it read. */
function resolveInputFailureRemedy(failure: InputFailure): Remedy {
  switch (failure.reason) {
    case 'changed':
      return { path: failure.path, text: RECOMPILE_REMEDY };
    case 'missing':
      return {
        path: failure.path,
        text: `Restore ${failure.path}, or run \`rdy compile\` if the kit no longer reads it.`,
      };
    case 'unprojectable':
      return {
        path: failure.path,
        text: `Restore the picked fields in ${failure.path}, or repoint the kit's \`pickJson\` call.`,
      };
  }
}

/**
 * Returns one remedy per failing input, and none where the verdict is `ok` or `unverified`.
 *
 * Ten inputs failing for one reason collapse to one remedy, since the caller deduplicates.
 */
function resolveInputRemedies(status: InputsStatus): Remedy[] {
  return status.kind === 'stale' ? status.failures.map(resolveInputFailureRemedy) : [];
}

/**
 * Returns the remedy for the rebuild verdict, or `undefined` where there is nothing to add.
 *
 * Defers to a source the hash axis reports as gone. The verdict names the file only inside a
 * free-text reason, so the caller's path rule cannot see the collision and the deferral is made
 * here. A drifted target needs no such guard: this verdict's recompile is bare, and the caller drops
 * a bare recompile for every axis at once.
 *
 * `failed` always speaks. It is about the source rather than the bundle, and a kit that no longer
 * compiles has to be fixed before any remedy naming a recompile can be carried out.
 */
function resolveRebuildRemedy(
  status: RebuildStatus | undefined,
  drift: DriftStatus,
  source: SourceStatus,
): Remedy | undefined {
  if (status === undefined) return undefined;

  switch (status.kind) {
    case 'ok':
      return undefined;
    case 'mismatch':
      return { text: RECOMPILE_REMEDY };
    case 'failed':
      return { text: 'Fix the kit source so it compiles.' };
    case 'missing':
      return hasTargetFailed(drift) || hasSourceFailed(source) ? undefined : { text: RECOMPILE_REMEDY };
  }
}

/**
 * Returns the remedy for the source verdict, or `undefined` where there is nothing to fix.
 *
 * A recompile is what drops a vanished kit from the manifest, because the sweep rewrites the whole
 * file from the sources it finds; nobody edits the entry out by hand.
 */
function resolveSourceRemedy(kit: RdyManifestKit, status: SourceStatus): Remedy | undefined {
  switch (status.kind) {
    case 'ok':
    case 'unverified':
      return undefined;
    case 'stale':
      return { ...(kit.source !== undefined && { path: kit.source }), text: RECOMPILE_REMEDY };
    case 'missing':
      return kit.source === undefined
        ? { text: RECOMPILE_REMEDY }
        : {
            path: kit.source,
            text: `Restore ${kit.source}, or run \`rdy compile\` to drop the kit from the manifest.`,
          };
  }
}

// endregion | Helpers
