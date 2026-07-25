import { defineConfig } from '@williamthorsen/nmr/taze';

/** Dependency-upgrade configuration for this monorepo. */
export default defineConfig({
  /**
   * A default maturity period is set by nmr.
   * Customize here or set to `undefined` to use Taze's default behavior.
   */
  // maturityPeriod: 7; // in days

  // Hold packages that must track a particular version line, so an upgrade pass never jumps them.
  packageMode: {
    // Disallow major upgrades until the pinned Node.js version is changed; engines is set to >=24.
    '@types/node': 'minor',
    // Hold typescript at v6 until v7 supports type-aware linting.
    typescript: 'minor',
  },
});
