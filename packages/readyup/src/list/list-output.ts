import { describeError } from '@williamthorsen/toolbelt.errors';

import { DEFAULT_CONFIG, loadConfig } from '../config/loadConfig.ts';
import { extractHint } from '../errors/error-handling.ts';
import type { ResolvedRdyConfig } from '../kits/types.ts';
import type { ReportedWarning } from '../output/writeWarnings.ts';
import { type JsonListKitEntry, type JsonListOutput, SCHEMA_VERSION } from '../schemas/listOutputSchema.ts';

/** Builds the `--json` document of a listing, in which each row keeps its check names only under `--checks`. */
export function buildListOutput({ availableSources = [], kits }: ListResult, showChecks: boolean): JsonListOutput {
  return {
    schemaVersion: SCHEMA_VERSION,
    kits: showChecks ? kits : kits.map(({ checklistChecks: _omitted, ...kit }) => kit),
    ...(availableSources.length > 0 && { availableSources }),
  };
}

/** What one listing mode found: its human view and the rows of its JSON document. */
export interface ListResult {
  /** The human view, without a trailing newline. */
  view: string;
  kits: JsonListKitEntry[];
  /** Installed kit packages that the config neither names nor omits, reported by the owner listing alone. */
  availableSources?: string[];
}

/**
 * Loads the project config or the one named by `--config`, falling back to the defaults with a warning for a config
 * that it cannot load.
 *
 * Listing is read-only, so when a config cannot be evaluated, the function drops the caller's settings rather
 * than the whole listing, taking the same warn-and-continue that the corrupt-manifest paths take. `run` still fails
 * hard on the same failure: It would otherwise execute against settings that nobody chose.
 */
export async function loadListingConfig(
  configPath: string | undefined,
): Promise<{ config: ResolvedRdyConfig; warnings: ReportedWarning[] }> {
  try {
    return {
      config: await loadConfig({ ...(configPath !== undefined && { overridePath: configPath }) }),
      warnings: [],
    };
  } catch (error: unknown) {
    const detail = describeError(error).replace(/\.$/, '');
    const remedy = extractHint(error);
    const warning = { message: `${detail}. Listing with default settings.`, ...(remedy !== undefined && { remedy }) };
    return { config: { ...DEFAULT_CONFIG }, warnings: [warning] };
  }
}
