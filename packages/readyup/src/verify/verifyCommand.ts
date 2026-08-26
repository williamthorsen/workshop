import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { EXIT_OK, EXIT_PROBLEMS_FOUND } from '../bin/exitCodes.ts';
import { ESBUILD_INSTALL_HINT } from '../compile/buildBundle.ts';
import { loadEsbuild } from '../compile/loadEsbuild.ts';
import { translateParseArgsError } from '../errors/parse-args-error.ts';
import { configError, usageError } from '../errors/RdyError.ts';
import { getLayout } from '../layout/engine.ts';
import type { TokenName } from '../layout/formatter.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { readManifest } from '../manifest/readManifest.ts';
import { writeHuman } from '../output/writeHuman.ts';
import { type JsonVerifyKitEntry, type JsonVerifyOutput, SCHEMA_VERSION } from '../schemas/verifyOutputSchema.ts';
import { VERSION } from '../version.ts';
import type { DriftStatus } from './checkDrift.ts';
import { checkDrift } from './checkDrift.ts';
import type { InputFailure, InputsStatus } from './checkInputDrift.ts';
import { checkInputDrift } from './checkInputDrift.ts';
import type { DependencyChange, RebuildStatus } from './checkRebuild.ts';
import { checkRebuild } from './checkRebuild.ts';
import type { SourceStatus } from './checkSourceDrift.ts';
import { checkSourceDrift } from './checkSourceDrift.ts';

/** Every verdict one kit reached, gathered so each pass over a kit reads the same set. */
interface KitVerdicts {
  drift: DriftStatus;
  inputs: InputsStatus;
  rebuild: RebuildStatus | undefined;
  source: SourceStatus;
}

const verifyOptions = {
  json: { type: 'boolean' },
  manifest: { type: 'string' },
  rebuild: { type: 'boolean' },
  // Declared so strict parsing accepts it; `routeCommand` consumed its value before dispatch.
  style: { type: 'string' },
} as const;

/**
 * Handles the `verify` subcommand: reads the manifest, hashes each kit's source and compiled
 * output, and reports what no longer matches.
 *
 * Each kit has three independent verdicts, and a fourth under `--rebuild`. Returns 0 when every
 * verdict is `ok` or `unverified`; 1 when any kit has drifted, gone stale, lost a file, or failed
 * to reproduce. An unreadable manifest is a config failure and is thrown rather than reported as
 * drift, as is a `--rebuild` run with no esbuild to rebuild with.
 */
export async function verifyCommand(args: string[]): Promise<number> {
  let parsed;
  try {
    parsed = nodeParseArgs({ args, options: verifyOptions, strict: true, allowPositionals: true });
  } catch (error: unknown) {
    throw usageError(translateParseArgsError(error, 'verify'), { cause: error });
  }
  const { values, positionals } = parsed;

  if (positionals.length > 0) {
    throw usageError('rdy verify does not accept positional arguments.');
  }

  for (const [name, value] of Object.entries(values)) {
    if (value === '') {
      throw usageError(`--${name} requires a value`);
    }
  }

  const json = values.json === true;
  const rebuild = values.rebuild === true;
  const manifestPath = path.resolve(process.cwd(), values.manifest ?? DEFAULT_MANIFEST_PATH);
  const manifestDir = path.dirname(manifestPath);

  // Settle the bundler's availability before the run says anything. An exactness check that reports
  // kit after kit and then discovers it could never have run reads as a partial result; raised here,
  // an absent esbuild is what it is -- a problem with the environment, not with any kit.
  if (rebuild) await requireEsbuild();

  let manifest;
  try {
    manifest = readManifest(manifestPath);
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error });
  }

  const relManifestPath = path.relative(process.cwd(), manifestPath);
  writeHuman(`${getLayout().formatHeading(`Verifying kits against ${relManifestPath}`, 'section')}\n`, json);

  if (manifest.kits.length === 0) {
    writeHuman('(no kits in manifest)\n', json);
    return finishVerify([], true, json);
  }

  const entries: JsonVerifyKitEntry[] = [];
  let failed = 0;
  for (const kit of manifest.kits) {
    const verdicts: KitVerdicts = {
      drift: checkDrift(kit, manifestDir),
      inputs: checkInputDrift(kit, manifestDir),
      rebuild: rebuild ? await checkRebuild(kit, manifestDir) : undefined,
      source: checkSourceDrift(kit, manifestDir),
    };
    writeHuman(formatStatusLine(kit, verdicts), json);
    entries.push(buildVerifyEntry(kit.name, verdicts));
    if (!isPassingVerdict(verdicts)) {
      failed += 1;
    }
  }

  if (failed > 0) {
    writeHuman(`\n${failed} of ${manifest.kits.length} kits failed verification.\n`, json);
  }

  return finishVerify(entries, failed === 0, json);
}

/**
 * Confirms esbuild is installed, raising a config error naming the install command when it is not.
 *
 * Refuses rather than degrading. `--rebuild` asks whether each bundle is reproducible, and a run
 * that answered "no esbuild, so nothing to report" would pass while establishing nothing -- the
 * failure mode the flag exists to remove.
 */
async function requireEsbuild(): Promise<void> {
  try {
    await loadEsbuild();
  } catch (error: unknown) {
    throw configError(`rdy verify --rebuild requires esbuild, which is not installed. ${ESBUILD_INSTALL_HINT}`, {
      cause: error,
    });
  }
}

/** Emits the verify payload under `--json` and turns the run's verdict into an exit code. */
function finishVerify(kits: JsonVerifyKitEntry[], passed: boolean, json: boolean): number {
  if (json) {
    const output: JsonVerifyOutput = { schemaVersion: SCHEMA_VERSION, passed, kits };
    process.stdout.write(JSON.stringify(output) + '\n');
  }

  return passed ? EXIT_OK : EXIT_PROBLEMS_FOUND;
}

/**
 * Returns true when none of a kit's verdicts reports a mismatch or a missing file.
 *
 * Reads the verdicts themselves rather than the entry serialized from them. Each is a total union,
 * so every case is accounted for; the wire shape leaves `sourceStatus` optional for consumers that
 * predate it, and a verdict derived from an optional field has an absent case to get wrong.
 *
 * `unverified` passes on every recorded-hash axis: a manifest entry with no recorded hash predates
 * the feature or was written with `--skip-manifest`, which says nothing about whether the kit has
 * changed. The rebuild axis has no such case -- only `ok` passes there, and a kit the rebuild could
 * not reach an answer for fails rather than being waived.
 */
function isPassingVerdict({ drift, inputs, rebuild, source }: KitVerdicts): boolean {
  const targetPasses = drift.kind === 'ok' || drift.kind === 'unverified';
  const sourcePasses = source.kind === 'ok' || source.kind === 'unverified';
  const inputsPass = inputs.kind === 'ok' || inputs.kind === 'unverified';
  const rebuildPasses = rebuild === undefined || rebuild.kind === 'ok';
  return targetPasses && sourcePasses && inputsPass && rebuildPasses;
}

/** Builds a kit's JSON entry, stating what a verdict compared only where it compared something. */
function buildVerifyEntry(name: string, { drift, inputs, rebuild, source }: KitVerdicts): JsonVerifyKitEntry {
  return {
    name,
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
 * A failing kit gets each verdict on its own line beneath its name; any other kit gets them inline.
 * A kit that passes every verdict shows none, leaving its token to report the outcome.
 */
function formatStatusLine(kit: RdyManifestKit, verdicts: KitVerdicts): string {
  const { drift, inputs, rebuild, source } = verdicts;
  const token = resolveToken(verdicts);
  // An unverified closure counts as confirmed, so an entry predating it gets the line it always did.
  const hashesConfirmed = drift.kind === 'ok' && source.kind === 'ok' && inputs.kind !== 'stale';
  const clauses = [
    describeDriftStatus(kit, drift),
    describeSourceStatus(kit, source),
    ...describeInputsStatus(inputs),
    describeRebuildStatus(rebuild, hashesConfirmed),
  ].filter((clause): clause is string => clause !== undefined);

  if (token === 'failedError') {
    const claim = getLayout().formatCheckLine({ token, name: kit.name });
    return [claim, ...getLayout().formatReasonBlock(clauses)].join('\n') + '\n';
  }

  const detail = clauses.join('; ');
  return getLayout().formatCheckLine({ token, name: kit.name, ...(detail !== '' && { detail }) }) + '\n';
}

/**
 * Returns the token for the worst of a kit's verdicts.
 *
 * A mismatch or a missing file on any axis yields a failure. The skip token needs an unverified
 * target and no answer from the rebuild: a rebuild that reproduced the bundle has checked the kit
 * more exactly than the absent hash would have, so the kit passed rather than went unchecked.
 */
function resolveToken({ drift, inputs, rebuild, source }: KitVerdicts): TokenName {
  const rebuildFailed = rebuild !== undefined && rebuild.kind !== 'ok';
  const anyFailed = hasTargetFailed(drift) || hasSourceFailed(source) || inputs.kind === 'stale' || rebuildFailed;
  if (anyFailed) return 'failedError';
  if (drift.kind === 'unverified' && rebuild?.kind !== 'ok') return 'skippedOptional';
  return 'passed';
}

/** Returns true when the compiled-output verdict reports a mismatch or a missing file. */
function hasTargetFailed(status: DriftStatus): boolean {
  return status.kind === 'missing' || status.kind === 'drift';
}

/** Returns true when the source verdict reports a mismatch or a missing file. */
function hasSourceFailed(status: SourceStatus): boolean {
  return status.kind === 'missing' || status.kind === 'stale';
}

/** Returns a clause describing the compiled-output verdict, or undefined when the verdict is `ok`. */
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

/** Returns a clause describing the source verdict, or undefined when it is `ok` or `unverified`. */
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

/** Returns one clause per failed input, and none when the verdict is `ok` or `unverified`. */
function describeInputsStatus(status: InputsStatus): string[] {
  return status.kind === 'stale' ? status.failures.map(describeInputFailure) : [];
}

/** Returns a clause naming one input the compile read and what has happened to it since. */
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

/**
 * Returns a clause describing the rebuild verdict, or undefined when there is nothing to add.
 *
 * A passing rebuild is silent only where the hash verdicts already reached `ok` and it would
 * restate them. Anywhere else it speaks, because it then holds the line's strongest answer: over
 * a failing verdict it says the bundle reproduces and the manifest's record of it is what went
 * wrong, and over an unverified one it supplies the answer the absent hash could not.
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

/** Returns a clause naming one bundled package and how its version moved since the compile. */
function describeDependencyChange(change: DependencyChange): string {
  const { name, rebuilt, recorded } = change;
  if (recorded !== undefined && rebuilt !== undefined) return `${name} ${recorded} -> ${rebuilt}`;
  if (rebuilt !== undefined) return `${name} ${rebuilt} newly bundled`;
  if (recorded !== undefined) return `${name} ${recorded} no longer bundled`;
  return name;
}
