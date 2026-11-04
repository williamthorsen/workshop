import { ADOPTION_KIT } from './adoptionKit.ts';
import { IT_KIT } from './itKit.ts';
import type { KitModel } from './kitModel.ts';
import { MIGRATION_KIT } from './migrationKit.ts';
import { ONBOARDING_KIT } from './onboardingKit.ts';
import { PREFLIGHT_KIT } from './preflightKit.ts';

/** The model of each kit page, keyed by the page's `data-kit`. */
export const KITS = {
  onboarding: ONBOARDING_KIT,
  preflight: PREFLIGHT_KIT,
  adoption: ADOPTION_KIT,
  migration: MIGRATION_KIT,
  it: IT_KIT,
} satisfies Record<string, KitModel>;
