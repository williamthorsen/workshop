import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { MOVE_EDITS_REMEDY, RECOMPILE_REMEDY } from '../reporting/remedies.ts';
import type { DriftStatus } from './checkDrift.ts';
import type { InputFailure, InputsStatus } from './checkInputDrift.ts';
import type { RebuildStatus } from './checkRebuild.ts';
import type { SourceStatus } from './checkSourceDrift.ts';
import { hasSourceFailed, type KitVerdicts } from './verdicts.ts';

/** One thing to do about a kit, and the file that it speaks for where it speaks for one. */
interface Remedy {
  path?: string;
  text: string;
}

/**
 * Returns what to do about a kit's failing verdicts, in axis order and without repetition.
 *
 * Keyed on the whole verdict set rather than one verdict at a time, because a drifted target's remedy depends on what
 * the rebuild found: A bundle that reproduces byte for byte has nothing to move into the source, and it is the
 * recorded hash that needs rewriting.
 *
 * A passing or `unverified` verdict contributes nothing, so a kit that fails no axis gets an empty list.
 */
export function resolveRemedies(kit: RdyManifestKit, verdicts: KitVerdicts): string[] {
  const { drift, inputs, rebuild, source } = verdicts;
  const targetDrifted = drift.kind === 'drift';
  const raised = [
    resolveDriftRemedy(drift, rebuild, source),
    resolveSourceRemedy(kit, source, targetDrifted),
    ...resolveInputRemedies(inputs),
    resolveRebuildRemedy(rebuild, source),
  ].filter((remedy): remedy is Remedy => remedy !== undefined);

  return collapseRemedies(raised, targetDrifted);
}

// region | Helpers

/**
 * Returns the remedies on which a reader can act, in the order the axes raised them.
 *
 * Two rules, each collapsing a pair that the axes reach independently and neither can see. A file named by more
 * than one axis is remedied once, by the axis that spoke first, which is the one holding the more exact account
 * of it: A kit's own source is recorded among its inputs, so deleting it fails both axes on one path and only the
 * source axis knows the file is the kit's entry.
 *
 * A remedy whose whole action is a bare recompile is dropped wherever the target has drifted, because `rdy compile`
 * refuses a drifted kit and exits non-zero. The `--force` remedy raised by the drift verdict is then the only command
 * that runs, and it recompiles from the same source, so it settles whatever the dropped remedy was raised for.
 * Drift alone gates this: A bundle that is merely gone recompiles normally, and its own remedy is the bare recompile.
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
 * Both `drift` branches name `--force`, because `rdy compile` gates on drift and skips the kit rather than
 * overwriting it. They differ in whether there are edits to move first, which is the question that `--rebuild`
 * answers. A missing bundle does not hit that gate, so a plain recompile regenerates it.
 *
 * Defers to a source that the hash axis reports as gone, which leaves no source to move edits into.
 */
function resolveDriftRemedy(
  status: DriftStatus,
  rebuild: RebuildStatus | undefined,
  source: SourceStatus,
): Remedy | undefined {
  switch (status.kind) {
    case 'ok':
    case 'unverified':
      return undefined;
    case 'drift':
      if (source.kind === 'missing') return undefined;
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

/** Returns the remedy for one recorded input that no longer matches what the compile read. */
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

/** Returns one remedy per failing input, and none where the verdict is `ok` or `unverified`. */
function resolveInputRemedies(status: InputsStatus): Remedy[] {
  return status.kind === 'stale' ? status.failures.map(resolveInputFailureRemedy) : [];
}

/**
 * Returns the remedy for the rebuild verdict, or `undefined` where there is nothing to add.
 *
 * Defers to a source that the hash axis reports as gone. The verdict names the file only inside a free-text reason,
 * so the caller's path rule cannot see the collision and the deferral is made here.
 *
 * `failed` always speaks. It is about the source rather than the bundle, and a kit that no longer compiles has to
 * be fixed before any remedy naming a recompile can run.
 */
function resolveRebuildRemedy(status: RebuildStatus | undefined, source: SourceStatus): Remedy | undefined {
  if (status === undefined) return undefined;

  switch (status.kind) {
    case 'ok':
      return undefined;
    case 'mismatch':
      return { text: RECOMPILE_REMEDY };
    case 'failed':
      return { text: 'Fix the kit source so it compiles.' };
    case 'missing':
      return hasSourceFailed(source) ? undefined : { text: RECOMPILE_REMEDY };
  }
}

/**
 * Returns the remedy for the source verdict, or `undefined` where there is nothing to fix.
 *
 * A recompile is what drops a vanished kit from the manifest, because the sweep rewrites the whole file from the
 * sources that it finds; nobody edits the entry out by hand. The sweep keeps a drifted bundle, so removing that kit
 * takes `--force`.
 */
function resolveSourceRemedy(kit: RdyManifestKit, status: SourceStatus, targetDrifted: boolean): Remedy | undefined {
  switch (status.kind) {
    case 'ok':
    case 'unverified':
      return undefined;
    case 'stale':
      return { ...(kit.source !== undefined && { path: kit.source }), text: RECOMPILE_REMEDY };
    case 'missing': {
      if (kit.source === undefined) return { text: RECOMPILE_REMEDY };
      const command = targetDrifted ? 'rdy compile --force' : 'rdy compile';
      return {
        path: kit.source,
        text: `Restore ${kit.source}, or run \`${command}\` to remove the kit and its bundle.`,
      };
    }
  }
}

// endregion | Helpers
