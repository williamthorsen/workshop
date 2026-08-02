import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { isMissingFile } from '../portable/isMissingFile.ts';
import { IdSchema } from '../schemas/common.ts';
import type { CompositorConfig, ConfigTier, TierBody } from '../schemas/config-schemas.ts';
import { TierBodySchema } from '../schemas/config-schemas.ts';

/** One tier to read: the identity a consumer gives it, and the file it reads that tier's declarations from. */
export const TierFileSchema = z.strictObject({
  id: IdSchema,
  label: z.string().min(1),
  path: z.string().min(1),
});

export type TierFile = z.infer<typeof TierFileSchema>;

/**
 * Reads the config the given tier files declare, lowest precedence first.
 *
 * Tier identity is the consumer's to supply: a file does not know which tier it is, that follows from where the consumer
 * looked for it, and keeping the decision outside means no particular project layout is compiled in here.
 *
 * A tier whose file is absent contributes no tier at all, while one whose file is present but empty contributes a tier
 * declaring nothing. That distinction is what lets a consumer tell "no config here" from "config here, saying nothing".
 * A chain where every file is absent yields a config with no tiers, which already expresses "nothing declared" without a
 * second sentinel.
 *
 * Loading is one way to obtain a config, not the only one: the value this returns is the same shape a consumer can build
 * in memory and hand straight to the flows downstream.
 */
export async function loadConfig(tiers: ReadonlyArray<TierFile>): Promise<CompositorConfig> {
  const validated = tiers.map((tier) => TierFileSchema.parse(tier));
  const loaded = await Promise.all(validated.map((tier) => readTier(tier)));
  return { tiers: loaded.filter((tier): tier is ConfigTier => tier !== undefined) };
}

// region | Helpers

/**
 * Parses the body `raw` declares, naming the file it came from on any failure.
 *
 * An empty or comment-only file parses to nullish, which is a tier declaring nothing rather than a malformed one.
 */
function parseTierBody(raw: string, filePath: string): TierBody {
  let document: unknown;
  try {
    document = parseYaml(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Config file "${filePath}" is not valid YAML: ${message}`, { cause: error });
  }

  const result = TierBodySchema.safeParse(document ?? {});
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Config file "${filePath}" is invalid: ${detail}`);
  }
  return result.data;
}

/** Reads `filePath`, resolving to nothing when it is absent. */
async function readFileIfPresent(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Reads one tier from its file, resolving to nothing when that file is absent.
 *
 * `baseDir` is the file's own directory, so a relative path a tier declares resolves against where it was written rather
 * than against whatever directory the process happens to be run from.
 */
async function readTier(tier: TierFile): Promise<ConfigTier | undefined> {
  const raw = await readFileIfPresent(tier.path);
  if (raw === undefined) {
    return undefined;
  }
  return {
    ...parseTierBody(raw, tier.path),
    id: tier.id,
    label: tier.label,
    baseDir: path.dirname(tier.path),
  };
}

// endregion | Helpers
