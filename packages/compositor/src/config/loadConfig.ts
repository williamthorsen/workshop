import path from 'node:path';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { readFileIfPresent } from '../portable/readFileIfPresent.ts';
import type { CompositorConfig, ConfigTier, TierBody } from '../schemas/config-schemas.ts';
import { TierBodySchema } from '../schemas/config-schemas.ts';
import { IdSchema } from '../schemas/scalar-schemas.ts';

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
 * Tier identity is the consumer's to supply: a file does not know which tier it is, that follows from where the
 * consumer looked for it. Two tiers sharing an id are rejected, because that id is what every seed and diagnostic
 * downstream names the tier by.
 *
 * A tier whose file is absent contributes no tier at all, while one whose file is present but empty contributes a tier
 * declaring nothing. That distinction is what lets a consumer tell "no config here" from "config here, saying nothing".
 * A chain where every file is absent yields a config with no tiers.
 */
export async function loadConfig(tiers: ReadonlyArray<TierFile>): Promise<CompositorConfig> {
  const validated = tiers.map((tier) => TierFileSchema.parse(tier));
  assertTierIdsAreUnique(validated);
  const loaded = await Promise.all(validated.map((tier) => readTier(tier)));
  return { tiers: loaded.filter((tier): tier is ConfigTier => tier !== undefined) };
}

// region | Helpers

/** Throws when two tier files share an id, naming the repeat. */
function assertTierIdsAreUnique(tiers: ReadonlyArray<TierFile>): void {
  const seen = new Set<string>();
  for (const { id } of tiers) {
    if (seen.has(id)) {
      throw new Error(`Tier "${id}" is declared more than once; a tier id names one tier.`);
    }
    seen.add(id);
  }
}

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
    throw chainError(`Config file "${filePath}" is not valid YAML`, error);
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

/**
 * Reads one tier from its file, resolving to `undefined` when that file is absent.
 *
 * `baseDir` is the file's own directory, so a relative path a tier declares resolves against where it was written, not
 * against the process's working directory.
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
