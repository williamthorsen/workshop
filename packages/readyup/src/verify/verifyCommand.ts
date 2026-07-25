import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { configError, usageError } from '../errors.ts';
import { EXIT_OK, EXIT_PROBLEMS_FOUND } from '../exitCodes.ts';
import { layout } from '../layout/engine.ts';
import type { TokenName } from '../layout/formatter.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { readManifest } from '../manifest/readManifest.ts';
import type { JsonVerifyKitEntry, JsonVerifyOutput } from '../schemas/index.ts';
import { SCHEMA_VERSION } from '../schemas/verifyOutputSchema.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { translateParseArgsError } from '../utils/parse-args-error.ts';
import { writeHuman } from '../writeHuman.ts';
import type { DriftStatus } from './checkDrift.ts';
import { checkDrift } from './checkDrift.ts';
import type { SourceStatus } from './checkSourceDrift.ts';
import { checkSourceDrift } from './checkSourceDrift.ts';

const verifyOptions = {
  json: { type: 'boolean' },
  manifest: { type: 'string' },
} as const;

/**
 * Handle the `verify` subcommand: read the manifest, hash each kit's source and compiled output,
 * and report what no longer matches.
 *
 * Each kit carries two independent verdicts. Returns 0 when both are `ok` or `unverified` for every
 * kit; 1 when any kit has drifted, gone stale, or lost a file. An unreadable manifest is a config
 * failure and is thrown rather than reported as drift.
 */
export function verifyCommand(args: string[]): number {
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
  const manifestPath = path.resolve(process.cwd(), values.manifest ?? DEFAULT_MANIFEST_PATH);
  const manifestDir = path.dirname(manifestPath);

  let manifest;
  try {
    manifest = readManifest(manifestPath);
  } catch (error: unknown) {
    throw configError(extractMessage(error), { cause: error });
  }

  const relManifestPath = path.relative(process.cwd(), manifestPath);
  writeHuman(layout.formatHeading(`Verifying kits against ${relManifestPath}`, 'section').join('\n') + '\n', json);

  if (manifest.kits.length === 0) {
    writeHuman('(no kits in manifest)\n', json);
    return finishVerify([], true, json);
  }

  const entries: JsonVerifyKitEntry[] = [];
  let failed = 0;
  for (const kit of manifest.kits) {
    const status = checkDrift(kit, manifestDir);
    const sourceStatus = checkSourceDrift(kit, manifestDir);
    writeHuman(formatStatusLine(kit, status, sourceStatus), json);
    entries.push(buildVerifyEntry(kit.name, status, sourceStatus));
    if (!isPassingVerdict(status, sourceStatus)) {
      failed += 1;
    }
  }

  if (failed > 0) {
    writeHuman(`\n${failed} of ${manifest.kits.length} kits failed verification.\n`, json);
  }

  return finishVerify(entries, failed === 0, json);
}

/** Emit the verify payload under `--json` and turn the run's verdict into an exit code. */
function finishVerify(kits: JsonVerifyKitEntry[], passed: boolean, json: boolean): number {
  if (json) {
    const output: JsonVerifyOutput = { schemaVersion: SCHEMA_VERSION, passed, kits };
    process.stdout.write(JSON.stringify(output) + '\n');
  }

  return passed ? EXIT_OK : EXIT_PROBLEMS_FOUND;
}

/**
 * Return true when neither of a kit's verdicts reports a mismatch or a missing file.
 *
 * Reads the verdicts themselves rather than the entry serialized from them. Both are total unions,
 * so every case is accounted for; the wire shape leaves `sourceStatus` optional for consumers that
 * predate it, and a verdict derived from an optional field has an absent case to get wrong.
 *
 * `unverified` passes on either axis: a manifest entry with no recorded hash predates the feature
 * or was written with `--skip-manifest`, which says nothing about whether the kit has changed.
 */
function isPassingVerdict(status: DriftStatus, sourceStatus: SourceStatus): boolean {
  const targetPasses = status.kind === 'ok' || status.kind === 'unverified';
  const sourcePasses = sourceStatus.kind === 'ok' || sourceStatus.kind === 'unverified';
  return targetPasses && sourcePasses;
}

/** Build a kit's JSON entry, carrying a pair of hashes only on a verdict that compared them. */
function buildVerifyEntry(name: string, status: DriftStatus, sourceStatus: SourceStatus): JsonVerifyKitEntry {
  return {
    name,
    status: status.kind,
    ...(status.kind === 'drift' && { expected: status.expected, actual: status.actual }),
    sourceStatus: sourceStatus.kind,
    ...(sourceStatus.kind === 'stale' && {
      sourceExpected: sourceStatus.expected,
      sourceActual: sourceStatus.actual,
    }),
  };
}

/**
 * Format a single per-kit line, reporting only the verdicts that have news.
 *
 * A failing kit carries just its name, with each verdict on its own line beneath -- a kit whose
 * target drifted *and* whose source went stale has two things to say, and a block gives each room
 * that an inline tail joined by semicolons does not. A passing or unverified kit keeps its verdict
 * inline, and a wholly verified one says nothing beyond its token: the reader's attention belongs on
 * whatever changed.
 */
function formatStatusLine(kit: RdyManifestKit, status: DriftStatus, sourceStatus: SourceStatus): string {
  const token = resolveToken(status, sourceStatus);
  const clauses = [describeDriftStatus(kit, status), describeSourceStatus(kit, sourceStatus)].filter(
    (clause): clause is string => clause !== undefined,
  );

  if (token === 'failedError') {
    const claim = layout.formatCheckLine({ token, name: kit.name });
    return [claim, ...layout.formatReasonBlock(clauses)].join('\n') + '\n';
  }

  const detail = clauses.join('; ');
  return layout.formatCheckLine({ token, name: kit.name, ...(detail !== '' && { detail }) }) + '\n';
}

/**
 * Pick the token for a kit's line from the worse of its two verdicts.
 *
 * A missing file and a hash mismatch both mean the tree does not match what the manifest describes,
 * so both read as failures. `unverified` shows only when it is the whole story, since a target
 * verified against its hash is not made less verified by a source the manifest never recorded.
 */
function resolveToken(status: DriftStatus, sourceStatus: SourceStatus): TokenName {
  const targetFailed = status.kind === 'missing' || status.kind === 'drift';
  const sourceFailed = sourceStatus.kind === 'missing' || sourceStatus.kind === 'stale';
  if (targetFailed || sourceFailed) return 'failedError';
  if (status.kind === 'unverified') return 'skippedOptional';
  return 'passed';
}

/** Describe the compiled-output verdict, or nothing when the token already says it. */
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

/** Describe the source verdict, or nothing when it has no news to add. */
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
