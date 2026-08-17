import type { CompositorConfig } from '../schemas/config-schemas.ts';
import { CompositorConfigSchema } from '../schemas/config-schemas.ts';

/**
 * One tier as a test declares it: an authored body, plus an identity defaulted from its position.
 *
 * `sources`, `select`, and `inlays` are untyped so a test can write the terse authored spellings the schema normalizes,
 * which is what most tests here are exercising the far side of.
 */
export interface TierInput {
  readonly id?: string;
  readonly baseDir?: string;
  readonly shouldReset?: boolean;
  readonly sources?: unknown;
  readonly select?: unknown;
  readonly inlays?: unknown;
}

/** Builds a normalized config whose tiers are `tiers`, lowest precedence first. */
export function buildConfig(tiers: ReadonlyArray<TierInput>): CompositorConfig {
  return CompositorConfigSchema.parse({
    tiers: tiers.map((tier, index) => ({
      id: tier.id ?? `tier-${index}`,
      label: tier.id ?? `tier-${index}`,
      baseDir: tier.baseDir ?? '/srv/app',
      shouldReset: tier.shouldReset,
      sources: tier.sources,
      select: tier.select,
      inlays: tier.inlays,
    })),
  });
}
