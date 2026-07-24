import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { configError, usageError } from '../errors.ts';
import { EXIT_OK, EXIT_PROBLEMS_FOUND } from '../exitCodes.ts';
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

// A line's icon is the worse of the kit's two verdicts. The mismatch icon carries a trailing space
// because its variation selector renders one column narrower than the others.
const ICON_OK = '✅';
const ICON_MISMATCH = '⚠️ ';
const ICON_MISSING = '❓';
const ICON_UNVERIFIED = '➖';

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
  writeHuman(`Verifying kits against ${relManifestPath}:\n`, json);

  if (manifest.kits.length === 0) {
    writeHuman('  (no kits in manifest)\n', json);
    return finishVerify([], json);
  }

  const entries: JsonVerifyKitEntry[] = [];
  let failed = 0;
  for (const kit of manifest.kits) {
    const status = checkDrift(kit, manifestDir);
    const sourceStatus = checkSourceDrift(kit, manifestDir);
    writeHuman(formatStatusLine(kit, status, sourceStatus), json);
    const entry = buildVerifyEntry(kit.name, status, sourceStatus);
    entries.push(entry);
    if (!isPassingEntry(entry)) {
      failed += 1;
    }
  }

  if (failed > 0) {
    writeHuman(`\n${failed} of ${manifest.kits.length} kits failed verification.\n`, json);
  }

  return finishVerify(entries, json);
}

/** Emit the verify payload under `--json` and reduce the per-kit verdicts to an exit code. */
function finishVerify(kits: JsonVerifyKitEntry[], json: boolean): number {
  const passed = kits.every(isPassingEntry);

  if (json) {
    const output: JsonVerifyOutput = { schemaVersion: SCHEMA_VERSION, passed, kits };
    process.stdout.write(JSON.stringify(output) + '\n');
  }

  return passed ? EXIT_OK : EXIT_PROBLEMS_FOUND;
}

/**
 * Return true when neither of a kit's verdicts reports a mismatch or a missing file.
 *
 * `unverified` passes on either axis: a manifest entry with no recorded hash predates the feature
 * or was written with `--skip-manifest`, which says nothing about whether the kit has changed.
 */
function isPassingEntry(kit: JsonVerifyKitEntry): boolean {
  const targetPasses = kit.status === 'ok' || kit.status === 'unverified';
  const sourcePasses = kit.sourceStatus === 'ok' || kit.sourceStatus === 'unverified';
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
 * Format a single per-kit line, appending the source verdict only when it has news.
 *
 * A source that is `ok`, or that no manifest entry describes, leaves the line saying exactly what it
 * said before the source verdict existed: the reader's attention belongs on whatever changed.
 */
function formatStatusLine(kit: RdyManifestKit, status: DriftStatus, sourceStatus: SourceStatus): string {
  const clauses = [describeDriftStatus(kit, status)];
  const sourceClause = describeSourceStatus(kit, sourceStatus);
  if (sourceClause !== undefined) clauses.push(sourceClause);
  return `  ${resolveIcon(status, sourceStatus)} ${kit.name} — ${clauses.join('; ')}\n`;
}

/**
 * Pick the icon for a kit's line from the worse of its two verdicts.
 *
 * A missing file outranks a hash mismatch: one of the artifacts the manifest describes is not there
 * at all. `unverified` shows only when it is the whole story, since a target verified against its
 * hash is not made less verified by a source the manifest never recorded.
 */
function resolveIcon(status: DriftStatus, sourceStatus: SourceStatus): string {
  if (status.kind === 'missing' || sourceStatus.kind === 'missing') return ICON_MISSING;
  if (status.kind === 'drift' || sourceStatus.kind === 'stale') return ICON_MISMATCH;
  if (status.kind === 'unverified') return ICON_UNVERIFIED;
  return ICON_OK;
}

/** Describe the compiled-output verdict, the clause every line carries. */
function describeDriftStatus(kit: RdyManifestKit, status: DriftStatus): string {
  switch (status.kind) {
    case 'ok':
      return 'ok';
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
