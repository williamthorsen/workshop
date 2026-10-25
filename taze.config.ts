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
    // Hold lefthook at 2.2.1 until a later release has provenance; 2.2.2 was published without it.
    lefthook: 'ignore',
    // Hold typescript at v6 until v7 supports type-aware linting.
    typescript: 'minor',
    // Hold vitest at v4 until @williamthorsen/nmr and @williamthorsen/toolbelt.vitest accept v5 as a peer.
    '@vitest/coverage-v8': 'minor',
    vitest: 'minor',
  },
});
