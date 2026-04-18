import path from 'node:path';
import process from 'node:process';

import { DEFAULT_MANIFEST_PATH } from '../manifest/manifestPath.ts';
import type { RdyManifestKit } from '../manifest/manifestSchema.ts';
import { readManifest } from '../manifest/readManifest.ts';
import { parseArgs, translateParseError } from '../parseArgs.ts';
import { extractMessage } from '../utils/error-handling.ts';
import type { DriftStatus } from './checkDrift.ts';
import { checkDrift } from './checkDrift.ts';

const verifyFlagSchema = {
  manifest: { long: '--manifest', type: 'string' as const },
};

/**
 * Handle the `verify` subcommand: read the manifest, hash each compiled kit, and report drift.
 *
 * Returns 0 when every kit is `ok` or `unverified`; 1 when any kit has `drift` or `missing`.
 */
export function verifyCommand(args: string[]): number {
  let parsed;
  try {
    parsed = parseArgs(args, verifyFlagSchema);
  } catch (error: unknown) {
    process.stderr.write(`Error: ${translateParseError(error)}\n`);
    return 1;
  }

  if (parsed.positionals.length > 0) {
    process.stderr.write('Error: rdy verify does not accept positional arguments.\n');
    return 1;
  }

  const manifestPath = path.resolve(process.cwd(), parsed.flags.manifest ?? DEFAULT_MANIFEST_PATH);
  const manifestDir = path.dirname(manifestPath);

  let manifest;
  try {
    manifest = readManifest(manifestPath);
  } catch (error: unknown) {
    const message = extractMessage(error);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  const relManifestPath = path.relative(process.cwd(), manifestPath);
  process.stdout.write(`Verifying kits against ${relManifestPath}:\n`);

  if (manifest.kits.length === 0) {
    process.stdout.write('  (no kits in manifest)\n');
    return 0;
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

  return failed > 0 ? 1 : 0;
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
