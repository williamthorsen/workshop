/**
 * Publication readiness for a package that ships its readyup kits to consumers.
 *
 * Strict throughout, because everything it checks is a way for a published package to carry checks that
 * do not run, or that run against something other than what the author wrote. `default` is the advisory
 * counterpart, for a project that authors kits without publishing them.
 *
 *   rdy run --from npm:readyup publishing
 */
import path from 'node:path';

import { DEFAULT_MANIFEST_PATH, defineRdyKit } from 'readyup';
import { fileExists } from 'readyup/check-utils';

import { buildFreshnessChecks } from './checks/buildFreshnessChecks.ts';
import { buildSelfContainmentChecks } from './checks/buildSelfContainmentChecks.ts';
import { describeFilesCoverage } from './checks/describeFilesCoverage.ts';
import { KITS_DIR, MANIFEST_DIR } from './checks/kit-layout.ts';

/** Bundle a bare `rdy run --from npm:<package>` resolves to. */
const DEFAULT_BUNDLE_PATH = path.join(KITS_DIR, 'default.js');

export default defineRdyKit({
  defaultSeverity: 'error',
  description: 'Publication readiness for a package that ships readyup kits',
  checklists: [
    {
      name: 'packaging',
      checks: [
        {
          name: `the "files" allowlist ships ${MANIFEST_DIR}`,
          check: describeFilesCoverage,
          fix: `Add "${MANIFEST_DIR}" to the "files" array in package.json`,
        },
        {
          // The manifest is what `rdy list --from npm:` reads, so a tarball without it publishes kits
          // no consumer can discover without running them.
          name: `${DEFAULT_MANIFEST_PATH} exists`,
          check: () => fileExists(DEFAULT_MANIFEST_PATH),
          fix: `Run 'rdy compile' to write ${DEFAULT_MANIFEST_PATH}`,
        },
        {
          // Advisory: publishing only named kits is legitimate, but a consumer's first invocation is a
          // bare one, and it fails with no kit under this name.
          name: `${DEFAULT_BUNDLE_PATH} exists`,
          severity: 'warn',
          check: () => fileExists(DEFAULT_BUNDLE_PATH),
          fix: `Name a kit "default" so a bare 'rdy run --from npm:<package>' resolves to it`,
        },
      ],
    },
    {
      name: 'freshness',
      checks: buildFreshnessChecks(),
    },
    {
      name: 'self-containment',
      checks: buildSelfContainmentChecks(),
    },
  ],
});
