import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { ESBUILD_INSTALL_HINT } from '../compile/buildBundle.ts';
import { loadEsbuild } from '../compile/loadEsbuild.ts';
import { configError, usageError } from '../errors.ts';
import { EXIT_OK, EXIT_PROBLEMS_FOUND } from '../exitCodes.ts';
import { getLayout } from '../layout/engine.ts';
import type { TokenName } from '../layout/formatter.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { readManifest } from '../manifest/readManifest.ts';
import type { JsonVerifyKitEntry, JsonVerifyOutput } from '../schemas/index.ts';
import { SCHEMA_VERSION } from '../schemas/verifyOutputSchema.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { translateParseArgsError } from '../utils/parse-args-error.ts';
import { VERSION } from '../version.ts';
import { writeHuman } from '../writeHuman.ts';
import type { DriftStatus } from './checkDrift.ts';
import { checkDrift } from './checkDrift.ts';
import type { RebuildStatus } from './checkRebuild.ts';
import { checkRebuild } from './checkRebuild.ts';
import type { SourceStatus } from './checkSourceDrift.ts';
import { checkSourceDrift } from './checkSourceDrift.ts';

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
 * Each kit carries two independent verdicts, and a third under `--rebuild`. Returns 0 when every
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
    throw configError(extractMessage(error), { cause: error });
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
    const status = checkDrift(kit, manifestDir);
    const sourceStatus = checkSourceDrift(kit, manifestDir);
    const rebuildStatus = rebuild ? await checkRebuild(kit, manifestDir) : undefined;
    writeHuman(formatStatusLine(kit, status, sourceStatus, rebuildStatus), json);
    entries.push(buildVerifyEntry(kit.name, status, sourceStatus, rebuildStatus));
    if (!isPassingVerdict(status, sourceStatus, rebuildStatus)) {
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
 * `unverified` passes on either hash axis: a manifest entry with no recorded hash predates the
 * feature or was written with `--skip-manifest`, which says nothing about whether the kit has
 * changed. The rebuild axis has no such case -- only `ok` passes there, and a kit the rebuild could
 * not reach an answer for fails rather than being waived.
 */
function isPassingVerdict(
  status: DriftStatus,
  sourceStatus: SourceStatus,
  rebuildStatus: RebuildStatus | undefined,
): boolean {
  const targetPasses = status.kind === 'ok' || status.kind === 'unverified';
  const sourcePasses = sourceStatus.kind === 'ok' || sourceStatus.kind === 'unverified';
  const rebuildPasses = rebuildStatus === undefined || rebuildStatus.kind === 'ok';
  return targetPasses && sourcePasses && rebuildPasses;
}

/** Builds a kit's JSON entry, carrying a pair of hashes only on a verdict that compared them. */
function buildVerifyEntry(
  name: string,
  status: DriftStatus,
  sourceStatus: SourceStatus,
  rebuildStatus: RebuildStatus | undefined,
): JsonVerifyKitEntry {
  return {
    name,
    status: status.kind,
    ...(status.kind === 'drift' && { expected: status.expected, actual: status.actual }),
    sourceStatus: sourceStatus.kind,
    ...(sourceStatus.kind === 'stale' && {
      sourceExpected: sourceStatus.expected,
      sourceActual: sourceStatus.actual,
    }),
    ...(rebuildStatus !== undefined && { rebuildStatus: rebuildStatus.kind }),
    ...(rebuildStatus?.kind === 'mismatch' && {
      rebuildExpected: rebuildStatus.expected,
      rebuildActual: rebuildStatus.actual,
      ...(rebuildStatus.compiledWith !== undefined && { rebuildCompiledWith: rebuildStatus.compiledWith }),
    }),
    ...(rebuildStatus?.kind === 'failed' && { rebuildError: rebuildStatus.message }),
  };
}

/**
 * Returns a kit's line, carrying whichever of its verdicts has something to report.
 *
 * A failing kit carries each verdict on its own line beneath its name; any other kit carries them
 * inline. A kit that passes every verdict carries none, leaving its token to report the outcome.
 */
function formatStatusLine(
  kit: RdyManifestKit,
  status: DriftStatus,
  sourceStatus: SourceStatus,
  rebuildStatus: RebuildStatus | undefined,
): string {
  const token = resolveToken(status, sourceStatus, rebuildStatus);
  const hashesConfirmed = status.kind === 'ok' && sourceStatus.kind === 'ok';
  const clauses = [
    describeDriftStatus(kit, status),
    describeSourceStatus(kit, sourceStatus),
    describeRebuildStatus(rebuildStatus, hashesConfirmed),
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
function resolveToken(
  status: DriftStatus,
  sourceStatus: SourceStatus,
  rebuildStatus: RebuildStatus | undefined,
): TokenName {
  const rebuildFailed = rebuildStatus !== undefined && rebuildStatus.kind !== 'ok';
  if (hasTargetFailed(status) || hasSourceFailed(sourceStatus) || rebuildFailed) return 'failedError';
  if (status.kind === 'unverified' && rebuildStatus?.kind !== 'ok') return 'skippedOptional';
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

/** Returns a clause describing the compiled-output verdict, or nothing when the verdict is `ok`. */
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

/** Returns a clause describing the source verdict, or nothing when it is `ok` or `unverified`. */
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
 * Returns a clause describing the rebuild verdict, or nothing when there is nothing to add.
 *
 * A passing rebuild is silent only where both hash verdicts already reached `ok` and it would
 * restate them. Anywhere else it speaks, because it then carries the line's strongest answer: over
 * a failing verdict it says the bundle reproduces and the manifest's record of it is what went
 * wrong, and over an unverified one it supplies the answer the absent hash could not.
 */
function describeRebuildStatus(status: RebuildStatus | undefined, hashesConfirmed: boolean): string | undefined {
  if (status === undefined) return undefined;

  switch (status.kind) {
    case 'ok':
      return hashesConfirmed ? undefined : 'rebuild ok';
    case 'mismatch': {
      const versions =
        status.compiledWith === undefined ? '' : `; compiled by readyup ${status.compiledWith}, rebuilt by ${VERSION}`;
      return `rebuild mismatch (rebuilt ${status.expected}, on disk ${status.actual}${versions})`;
    }
    case 'failed':
      return `rebuild failed (${status.message})`;
    case 'missing':
      return `cannot rebuild (${status.reason})`;
  }
}
