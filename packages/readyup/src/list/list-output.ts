import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { EXIT_OK } from '../bin/exitCodes.ts';
import { DEFAULT_CONFIG, loadConfig } from '../config/loadConfig.ts';
import { extractHint } from '../errors/error-handling.ts';
import { configError } from '../errors/RdyError.ts';
import type { ResolvedRdyConfig } from '../kits/types.ts';
import { getLayout } from '../layout/engine.ts';
import type { RdyManifest } from '../manifest/manifestSchema.ts';
import { readManifest } from '../manifest/readManifest.ts';
import { type JsonListKitEntry, type JsonListOutput, SCHEMA_VERSION } from '../schemas/listOutputSchema.ts';

/** The `list` flags that decide what every listing mode emits. */
export interface ListOutputOptions {
  json: boolean;
  showChecks: boolean;
}

/**
 * Emits the list payload under `--json`, succeeding whenever the listing's source could be read.
 *
 * Each row keeps its check names only under `--checks`.
 */
export function finishList(
  kits: JsonListKitEntry[],
  { json, showChecks }: ListOutputOptions,
  availableSources: string[] = [],
): number {
  if (json) {
    const payload: JsonListOutput = {
      schemaVersion: SCHEMA_VERSION,
      kits: showChecks ? kits : kits.map(({ checklistChecks: _omitted, ...kit }) => kit),
      ...(availableSources.length > 0 && { availableSources }),
    };
    process.stdout.write(JSON.stringify(payload) + '\n');
  }
  return EXIT_OK;
}

/**
 * Loads the project config or the one named by `--config`, falling back to the defaults and reporting a
 * config that it cannot load.
 *
 * Listing is read-only, so when a config cannot be evaluated, the function drops the caller's settings rather
 * than the whole listing, taking the same warn-and-continue that the corrupt-manifest paths take. `run` still fails
 * hard on the same failure: It would otherwise execute against settings that nobody chose.
 */
export async function loadListingConfig(configPath: string | undefined): Promise<ResolvedRdyConfig> {
  try {
    return await loadConfig({ ...(configPath !== undefined && { overridePath: configPath }) });
  } catch (error: unknown) {
    const detail = describeError(error).replace(/\.$/, '');
    process.stderr.write(`Warning: ${detail}. Listing with default settings.\n`);
    const hint = extractHint(error);
    if (hint !== undefined) process.stderr.write(getLayout().formatHint(hint) + '\n');
    return { ...DEFAULT_CONFIG };
  }
}

/** Reads a manifest, reporting an unreadable or invalid one as a config failure. */
export function readManifestOrThrow(manifestPath: string): RdyManifest {
  try {
    return readManifest(manifestPath);
  } catch (error: unknown) {
    throw configError(describeError(error), { cause: error });
  }
}

/** Warns of a manifest that exists and cannot be read, whose kits the listing then reads from disk. */
export function warnOfUnreadableManifest(error: unknown): void {
  process.stderr.write(`Warning: ${describeError(error)}\n`);
}
