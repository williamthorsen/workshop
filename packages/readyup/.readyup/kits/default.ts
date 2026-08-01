/**
 * Authoring hygiene for any project that defines readyup kits.
 *
 * Advisory throughout: a project mid-edit is not broken, and this kit is meant to be safe to run at any
 * moment. `publishing` is the strict counterpart, for a package that ships its kits to consumers.
 *
 *   rdy run --from npm:readyup
 */
import { DEFAULT_MANIFEST_PATH, defineRdyKit } from 'readyup';
import { fileExists } from 'readyup/check-utils';

import { buildFreshnessChecks } from './lib/buildFreshnessChecks.ts';
import { KITS_DIR, listCompiledBundlePaths } from './lib/kit-layout.ts';

/** The one path `loadConfig` looks in; see `src/loadConfig.ts`. */
const CONFIG_PATH = '.config/readyup.config.ts';

export default defineRdyKit({
  defaultSeverity: 'warn',
  description: 'Authoring hygiene for a project that defines readyup kits',
  checklists: [
    {
      name: 'setup',
      checks: [
        {
          name: `${KITS_DIR} exists`,
          check: () => fileExists(KITS_DIR),
          fix: `Run 'rdy init' to scaffold a starter config and kit`,
        },
        {
          name: `${CONFIG_PATH} exists`,
          severity: 'recommend',
          check: () => fileExists(CONFIG_PATH),
          fix: `Run 'rdy init' to scaffold one; without it, compile settings fall back to their defaults`,
        },
        {
          // A project running its kits with `--jit` compiles nothing and needs no manifest, so the
          // claim only applies once a bundle exists to be recorded.
          name: `${DEFAULT_MANIFEST_PATH} exists`,
          skip: () => (listCompiledBundlePaths().length === 0 ? 'nothing compiled' : false),
          check: () => fileExists(DEFAULT_MANIFEST_PATH),
          fix: `Run 'rdy compile' to record every compiled kit and its hashes`,
        },
      ],
    },
    {
      name: 'freshness',
      checks: buildFreshnessChecks(),
    },
  ],
});
