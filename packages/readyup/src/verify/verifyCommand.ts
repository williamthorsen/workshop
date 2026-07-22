import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

import { configError, usageError } from '../errors.ts';
import { EXIT_OK, EXIT_PROBLEMS_FOUND } from '../exitCodes.ts';
import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { readManifest } from '../manifest/readManifest.ts';
import { extractMessage } from '../utils/error-handling.ts';
import { translateParseArgsError } from '../utils/parse-args-error.ts';
import type { DriftStatus } from './checkDrift.ts';
import { checkDrift } from './checkDrift.ts';

const verifyOptions = {
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

  const manifestPath = path.resolve(process.cwd(), values.manifest ?? DEFAULT_MANIFEST_PATH);
  const manifestDir = path.dirname(manifestPath);

  let manifest;
  try {
    manifest = readManifest(manifestPath);
  } catch (error: unknown) {
    throw configError(extractMessage(error), { cause: error });
  }

  const relManifestPath = path.relative(process.cwd(), manifestPath);
  process.stdout.write(`Verifying kits against ${relManifestPath}:\n`);

  if (manifest.kits.length === 0) {
    process.stdout.write('  (no kits in manifest)\n');
    return EXIT_OK;
  }

  let failed = 0;
  for (const kit of manifest.kits) {
    const status = checkDrift(kit, manifestDir);
    process.stdout.write(formatStatusLine(kit, status));
    if (status.kind === 'drift' || status.kind === 'missing') {
      failed += 1;
    }
  }

  if (failed > 0) {
    process.stdout.write(`\n${failed} of ${manifest.kits.length} kits failed verification.\n`);
  }

  return failed > 0 ? EXIT_PROBLEMS_FOUND : EXIT_OK;
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
