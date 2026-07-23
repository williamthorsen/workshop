import { defineConfig } from '@williamthorsen/nmr/taze';

/**
 * Dependency-upgrade configuration for this monorepo.
 * The release-soak policy comes from nmr; what is declared here is only what is specific to this repo.
 */
export default defineConfig({
  // Hold packages that must track a particular version line, so an upgrade pass never jumps them.
  packageMode: {
    // Disallow major upgrades until the pinned Node.js version is changed; engines is set to >=24.
    '@types/node': 'minor',
    // Hold typescript at v6 until v7 supports type-aware linting.
    typescript: 'minor',
  },
});
