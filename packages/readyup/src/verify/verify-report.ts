import { getLayout } from '../layout/engine.ts';
import type { TokenName } from '../layout/formatter.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import type { JsonVerifyKitEntry, JsonVerifyUncompiledEntry } from '../schemas/verifyOutputSchema.ts';
import { VERSION } from '../version.ts';
import type { DriftStatus } from './checkDrift.ts';
import type { InputFailure, InputsStatus } from './checkInputDrift.ts';
import type { DependencyChange, RebuildStatus } from './checkRebuild.ts';
import type { SourceStatus } from './checkSourceDrift.ts';
import { resolveRemedies } from './remedies.ts';
import { hasSourceFailed, hasTargetFailed, type KitVerdicts } from './verdicts.ts';

/** Builds a kit's JSON entry, stating what a verdict compared only when it compared something. */
export function buildVerifyEntry(
  name: string,
  { drift, inputs, rebuild, source }: KitVerdicts,
  project: string | undefined,
): JsonVerifyKitEntry {
  return {
    name,
    ...(project !== undefined && { project }),
    status: drift.kind,
    ...(drift.kind === 'drift' && { expected: drift.expected, actual: drift.actual }),
    sourceStatus: source.kind,
    ...(source.kind === 'stale' && {
      sourceExpected: source.expected,
      sourceActual: source.actual,
    }),
    inputsStatus: inputs.kind,
    ...(inputs.kind === 'stale' && { inputFailures: inputs.failures }),
    ...(rebuild !== undefined && { rebuildStatus: rebuild.kind }),
    ...(rebuild?.kind === 'mismatch' && {
      rebuildExpected: rebuild.expected,
      rebuildActual: rebuild.actual,
      ...(rebuild.compiledWith !== undefined && { rebuildCompiledWith: rebuild.compiledWith }),
      ...(rebuild.esbuild !== undefined && { rebuildEsbuild: rebuild.esbuild }),
      ...(rebuild.dependencyChanges !== undefined && { rebuildDependencyChanges: rebuild.dependencyChanges }),
    }),
    ...(rebuild?.kind === 'failed' && { rebuildError: rebuild.message }),
  };
}

/**
 * Returns a kit's line, showing whichever of its verdicts has something to report.
 *
 * A failing kit gets each verdict on its own line beneath its name, then what to do about them, one
 * line per distinct remedy; any other kit gets its verdicts inline and no remedy, having nothing to
 * fix. A kit that passes every verdict shows none, leaving its token to report the outcome.
 */
export function formatStatusLine(kit: RdyManifestKit, verdicts: KitVerdicts): string {
  const { drift, inputs, rebuild, source } = verdicts;
  const token = resolveToken(verdicts);
  // An unverified closure counts as confirmed, so an entry predating it gets the line that it always did.
  const hashesConfirmed = drift.kind === 'ok' && source.kind === 'ok' && inputs.kind !== 'stale';
  const clauses = [
    describeDriftStatus(kit, drift),
    describeSourceStatus(kit, source),
    ...describeInputsStatus(inputs),
    describeRebuildStatus(rebuild, hashesConfirmed),
  ].filter((clause): clause is string => clause !== undefined);

  if (token === 'failedError') {
    const claim = getLayout().formatCheckLine({ token, name: kit.name });
    const remedies = resolveRemedies(kit, verdicts).map((remedy) => getLayout().formatFix(remedy));
    return [claim, ...getLayout().formatReasonBlock([...clauses, ...remedies])].join('\n') + '\n';
  }

  const detail = clauses.join('; ');
  return getLayout().formatCheckLine({ token, name: kit.name, ...(detail !== '' && { detail }) }) + '\n';
}

/** Returns the failing line for a kit source that the manifest does not record, with the remedy. */
export function formatUncompiledLine(entry: JsonVerifyUncompiledEntry): string {
  const layout = getLayout();
  const claim = layout.formatCheckLine({ token: 'failedError', name: entry.name });
  const reasons = [`source not compiled (${entry.source})`, layout.formatFix('Run `rdy compile` to compile it.')];
  return [claim, ...layout.formatReasonBlock(reasons)].join('\n') + '\n';
}

/**
 * Returns `true` when none of a kit's verdicts reports a mismatch or a missing file.
 *
 * Reads the verdicts themselves rather than the entry serialized from them. Each is a total union,
 * so every case is accounted for; the wire shape leaves `sourceStatus` optional for consumers that
 * predate it, and a verdict derived from an optional field has an absent case to get wrong.
 *
 * `unverified` passes on every recorded-hash axis: A manifest entry with no recorded hash predates
 * the feature or was written with `--skip-manifest`, which says nothing about whether the kit has
 * changed. The rebuild axis has no such case -- only `ok` passes there, and a kit on which the
 * rebuild could not reach a verdict fails rather than being waived.
 */
export function isPassingVerdict({ drift, inputs, rebuild, source }: KitVerdicts): boolean {
  const targetPasses = drift.kind === 'ok' || drift.kind === 'unverified';
  const sourcePasses = source.kind === 'ok' || source.kind === 'unverified';
  const inputsPass = inputs.kind === 'ok' || inputs.kind === 'unverified';
  const rebuildPasses = rebuild === undefined || rebuild.kind === 'ok';
  return targetPasses && sourcePasses && inputsPass && rebuildPasses;
}

// region | Helpers

/** Returns a clause naming one bundled package and how its version moved since the compile. */
function describeDependencyChange(change: DependencyChange): string {
  const { name, rebuilt, recorded } = change;
  if (recorded !== undefined && rebuilt !== undefined) return `${name} ${recorded} -> ${rebuilt}`;
  if (rebuilt !== undefined) return `${name} ${rebuilt} newly bundled`;
  if (recorded !== undefined) return `${name} ${recorded} no longer bundled`;
  return name;
}

/** Returns a clause describing the compiled-output verdict, or `undefined` when the verdict is `ok`. */
function describeDriftStatus(kit: RdyManifestKit, status: DriftStatus): string | undefined {
  switch (status.kind) {
    case 'ok':
      return undefined;
    case 'drift':
      return `drift (expected ${status.expected}, got ${status.actual})`;
    case 'missing':
      return `compiled file missing (expected ${kit.path ?? '<no path>'})`;
    case 'unverified':
      return 'unverified (no targetHash in manifest)';
  }
}

/** Returns a clause naming one input read by the compile and what has happened to it since. */
function describeInputFailure(failure: InputFailure): string {
  switch (failure.reason) {
    case 'changed':
      return `input stale: ${failure.path} (${failure.kind}, expected ${failure.expected}, got ${failure.actual})`;
    case 'missing':
      return `input missing: ${failure.path} (${failure.kind})`;
    case 'unprojectable':
      return `input unprojectable: ${failure.path} (${failure.detail})`;
  }
}

/** Returns one clause per failed input, and none when the verdict is `ok` or `unverified`. */
function describeInputsStatus(status: InputsStatus): string[] {
  return status.kind === 'stale' ? status.failures.map(describeInputFailure) : [];
}

/**
 * Returns one clause per cause, naming which versions changed between the compile and the rebuild.
 *
 * When the entry has the toolchain record and nothing in it changed, the single clause says so and
 * names what the record cannot see: an edited bundle, a changed input, or a dependency whose content
 * changed without a version change.
 */
function describeMismatchCauses(status: Extract<RebuildStatus, { kind: 'mismatch' }>): string[] {
  const causes: string[] = [];
  if (status.compiledWith !== undefined) {
    causes.push(`compiled by readyup ${status.compiledWith}, rebuilt by ${VERSION}`);
  }
  if (status.esbuild !== undefined && status.esbuild.recorded !== status.esbuild.rebuilt) {
    causes.push(`esbuild ${status.esbuild.recorded} -> ${status.esbuild.rebuilt}`);
  }
  const dependencyChanges = status.dependencyChanges ?? [];
  for (const change of dependencyChanges) {
    causes.push(describeDependencyChange(change));
  }

  if (causes.length === 0 && status.esbuild !== undefined) {
    causes.push(
      'recorded esbuild and dependency versions match the rebuild; the cause is an edited bundle, a changed input, or dependency content changed without a version bump',
    );
  }
  return causes;
}

/**
 * Returns a clause describing the rebuild verdict, or `undefined` when there is nothing to add.
 *
 * A passing rebuild is silent only when the hash verdicts already reached `ok` and it would
 * restate them. In every other case it adds a clause, because it then has the line's strongest
 * evidence: Over a failing verdict it says the bundle reproduces and the manifest's record of it is
 * what went wrong, and over an unverified one it supplies the verdict that the absent hash could not.
 */
function describeRebuildStatus(status: RebuildStatus | undefined, hashesConfirmed: boolean): string | undefined {
  if (status === undefined) return undefined;

  switch (status.kind) {
    case 'ok':
      return hashesConfirmed ? undefined : 'rebuild ok';
    case 'mismatch': {
      const causes = describeMismatchCauses(status);
      const detail = causes.length === 0 ? '' : `; ${causes.join('; ')}`;
      return `rebuild mismatch (rebuilt ${status.expected}, on disk ${status.actual}${detail})`;
    }
    case 'failed':
      return `rebuild failed (${status.message})`;
    case 'missing':
      return `cannot rebuild (${status.reason})`;
  }
}

/** Returns a clause describing the source verdict, or `undefined` when it is `ok` or `unverified`. */
function describeSourceStatus(kit: RdyManifestKit, status: SourceStatus): string | undefined {
  switch (status.kind) {
    case 'stale':
      return `source stale (expected ${status.expected}, got ${status.actual})`;
    case 'missing':
      return `source file missing (expected ${kit.source ?? '<no source>'})`;
    case 'ok':
    case 'unverified':
      return undefined;
  }
}

/**
 * Returns the token for the worst of a kit's verdicts.
 *
 * A mismatch or a missing file on any axis yields a failure. The skip token needs an unverified
 * target and no verdict from the rebuild: A kit whose rebuild reproduced the bundle passed rather than
 * went unchecked, because the rebuild has checked it more exactly than the absent hash would have.
 */
function resolveToken({ drift, inputs, rebuild, source }: KitVerdicts): TokenName {
  const rebuildFailed = rebuild !== undefined && rebuild.kind !== 'ok';
  const anyFailed = hasTargetFailed(drift) || hasSourceFailed(source) || inputs.kind === 'stale' || rebuildFailed;
  if (anyFailed) return 'failedError';
  if (drift.kind === 'unverified' && rebuild?.kind !== 'ok') return 'skippedOptional';
  return 'passed';
}

// endregion | Helpers
