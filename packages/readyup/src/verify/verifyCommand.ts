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

const verifyOptions = {
  json: { type: 'boolean' },
  manifest: { type: 'string' },
} as const;

/**
 * Handle the `verify` subcommand: read the manifest, hash each compiled kit, and report drift.
 *
 * Returns 0 when every kit is `ok` or `unverified`; 1 when any kit has `drift` or `missing`.
 * An unreadable manifest is a config failure and is thrown rather than reported as drift.
 */
export function verifyCommand(args: string[]): number {
  let parsed;
  try {
    parsed = nodeParseArgs({ args, options: verifyOptions, strict: true, allowPositionals: true });
  } catch (error: unknown) {
    throw usageError(translateParseArgsError(error), { cause: error });
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
    writeHuman(formatStatusLine(kit, status), json);
    entries.push(buildVerifyEntry(kit.name, status));
    if (status.kind === 'drift' || status.kind === 'missing') {
      failed += 1;
    }
  }

  if (failed > 0) {
    writeHuman(`\n${failed} of ${manifest.kits.length} kits failed verification.\n`, json);
  }

  return finishVerify(entries, json);
}

/**
 * Emit the verify payload under `--json` and reduce the per-kit verdicts to an exit code.
 *
 * `unverified` does not fail the run: a manifest entry with no recorded hash predates the feature
 * or was written with `--skip-manifest`, which says nothing about whether the kit has drifted.
 */
function finishVerify(kits: JsonVerifyKitEntry[], json: boolean): number {
  const passed = kits.every((kit) => kit.status === 'ok' || kit.status === 'unverified');

  if (json) {
    const output: JsonVerifyOutput = { schemaVersion: SCHEMA_VERSION, passed, kits };
    process.stdout.write(JSON.stringify(output) + '\n');
  }

  return passed ? EXIT_OK : EXIT_PROBLEMS_FOUND;
}

/** Build a kit's JSON entry, carrying the two hashes only on a verdict that compared them. */
function buildVerifyEntry(name: string, status: DriftStatus): JsonVerifyKitEntry {
  if (status.kind === 'drift') {
    return { name, status: 'drift', expected: status.expected, actual: status.actual };
  }
  return { name, status: status.kind };
}

/** Format a single per-kit status line for the verify report. */
function formatStatusLine(kit: RdyManifestKit, status: DriftStatus): string {
  switch (status.kind) {
    case 'ok':
      return `  ✅ ${kit.name} — ok\n`;
    case 'drift':
      return `  ⚠️  ${kit.name} — drift (expected ${status.expected}, got ${status.actual})\n`;
    case 'missing':
      return `  ❓ ${kit.name} — compiled file missing (expected ${kit.path ?? '<no path>'})\n`;
    case 'unverified':
      return `  ➖ ${kit.name} — unverified (no targetHash in manifest)\n`;
  }
}
