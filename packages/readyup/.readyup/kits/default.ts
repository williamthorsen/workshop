/**
 * Setup hygiene for any project that defines readyup kits or runs the kits that its dependencies publish.
 *
 * Advisory throughout: A project mid-edit is not broken, and this kit is meant to be safe to run at any
 * moment. `publishing` is the strict counterpart, for a package that publishes its kits to consumers.
 *
 *   rdy run --from npm:readyup
 */
import { DEFAULT_MANIFEST_PATH, defineRdyKit } from 'readyup';
import { discoverKitPackages, fileExists, loadRdyConfig, missingFrom } from 'readyup/check-utils';

import { buildFreshnessChecks } from './checks/buildFreshnessChecks.ts';
import { skipWithoutBundles, skipWithoutKits } from './checks/kit-layout.ts';

/** The one path in which `loadConfig` looks; see `src/loadConfig.ts`. */
const CONFIG_PATH = '.config/readyup.config.ts';

export default defineRdyKit({
  defaultSeverity: 'warn',
  description: 'Setup hygiene for a project that defines readyup kits or runs those of its dependencies',
  checklists: [
    {
      name: 'setup',
      checks: [
        {
          name: `${CONFIG_PATH} exists`,
          severity: 'recommend',
          skip: skipWithoutKits,
          check: () => fileExists(CONFIG_PATH),
          fix: `Run 'rdy init' to scaffold one; without it, compile settings fall back to their defaults`,
        },
        {
          // A project running its kits with `--jit` compiles nothing and needs no manifest, so the
          // claim only applies once a bundle exists to be recorded. The broader reason comes first:
          // A project with no kits at all has not declined to compile them.
          name: `${DEFAULT_MANIFEST_PATH} exists`,
          skip: () => skipWithoutKits() || skipWithoutBundles(),
          check: () => fileExists(DEFAULT_MANIFEST_PATH),
          fix: `Run 'rdy compile' to record every compiled kit and its hashes`,
        },
        {
          // A monorepo root that lists `sources` usually defines no kits of its own, and it is the project that
          // this check is for. The claim applies once the config lists any source.
          name: 'Every installed dependency that publishes kits is listed in "sources"',
          skip: async () =>
            (await loadRdyConfig()).sources.length === 0 ? 'The readyup config lists no sources' : false,
          check: async () => {
            const { omittedSources, sources } = await loadRdyConfig();
            const expected = discoverKitPackages()
              .map((name) => `npm:${name}`)
              .filter((spelling) => !omittedSources.includes(spelling));
            const listed = sources.map((configured) => configured.spelling);
            return missingFrom('from "sources"', expected, listed);
          },
          fix: `Add each package to "sources" in ${CONFIG_PATH} so that 'rdy run --sources' runs its kits, or to "omittedSources" to leave it out on purpose`,
        },
      ],
    },
    {
      name: 'freshness',
      checks: buildFreshnessChecks(),
    },
  ],
});
