import { defineConfig } from '@williamthorsen/nmr/taze';

/** Dependency-upgrade configuration for this monorepo. */
export default defineConfig({
  // Hold packages that must track a particular version line, so an upgrade pass never jumps them.
  packageMode: {
    // Disallow major upgrades until the pinned Node.js version is changed; engines is set to >=24.
    '@types/node': 'minor',
    // Hold lefthook at 2.2.1 until a later release has provenance; 2.2.2 was published without it.
    lefthook: 'ignore',
    // Hold typescript at v6 until v7 supports type-aware linting.
    typescript: 'minor',
  },
});
