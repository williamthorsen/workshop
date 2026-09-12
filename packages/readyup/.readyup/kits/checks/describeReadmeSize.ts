import { readdirSync } from 'node:fs';
import process from 'node:process';

import type { CheckOutcome } from 'readyup';
import { readFile } from 'readyup/check-utils';

/** Code points that the npm registry keeps of a published package's `readme` field, dropping the rest. */
export const README_CODE_POINT_LIMIT = 65_536;

/**
 * Whether the README that npm would publish fits inside the registry's `readme` field.
 *
 * The registry truncates the field silently and mid-sentence, so npmjs.com serves a README over the
 * limit as a page that stops inside whatever section reaches the boundary, and shows no section after
 * it. Code points are the unit in which the registry counts, which is neither bytes nor UTF-16 units.
 *
 * A package with no README passes: There is nothing for npm to truncate. The check has no verdict for
 * a package root that it cannot read, so the read goes uncaught. The measure is the file as committed,
 * and release-kit inserts the version's notes at publish time, so the published field sits closer to
 * the limit than this reports.
 */
export function describeReadmeSize(): CheckOutcome {
  const file = findReadme();
  if (file === undefined) return { ok: true, detail: 'The package has no README' };

  const content = readFile(file);
  if (content === undefined) return { ok: false, detail: `${file} is unreadable` };

  const count = Array.from(content).length;
  const detail = `${file} is ${count.toLocaleString('en-US')} code points`;

  return { detail, ok: count <= README_CODE_POINT_LIMIT };
}

// region | Helpers

/**
 * The README that npm would read out of the package root, or `undefined` where it would find none.
 *
 * Chosen the way `@npmcli/package-json` chooses it: A candidate is a root file named `README` or
 * `README.*` in any case, the first whose extension reads as Markdown wins, and a bare `README` stands
 * in where none does. A lone `README.txt` is therefore no README to npm, and none to this check either.
 */
function findReadme(): string | undefined {
  const candidates = readdirSync(process.cwd(), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^readme(\..*)?$/i.test(entry.name))
    .map((entry) => entry.name)
    .toSorted();

  const markdown = candidates.find((name) => /\.m?a?r?k?d?o?w?n?$/i.test(name));
  return markdown ?? candidates.find((name) => /^readme$/i.test(name));
}

// endregion | Helpers
