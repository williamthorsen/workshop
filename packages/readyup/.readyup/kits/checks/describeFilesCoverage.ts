import type { CheckOutcome } from 'readyup';
import { readPackageJson } from 'readyup/check-utils';

import { MANIFEST_DIR } from './kit-layout.ts';

/**
 * Whether the package's `files` allowlist ships the kit directory.
 *
 * A containment test rather than an npm-packlist emulation: an absent `files` field ships everything
 * and passes, and otherwise one entry must name the kit directory or the package root. A maintainer
 * using globs or negations in `files` gets a false failure. That is accepted, because the bundles and
 * the manifest have to travel together, and a glob covering both cannot be told from one covering
 * neither without resolving it the way npm would.
 */
export function describeFilesCoverage(): CheckOutcome {
  const packageJson = readPackageJson();
  if (packageJson === undefined) return { ok: false, detail: 'package.json is missing or unreadable' };

  const files = packageJson['files'];
  if (files === undefined) {
    return { ok: true, detail: 'package.json declares no "files" allowlist, so everything ships' };
  }
  if (!Array.isArray(files)) return { ok: false, detail: '"files" is not an array' };

  const covering = files
    .filter((entry) => typeof entry === 'string')
    .map(normalizeEntry)
    .find((entry) => entry === MANIFEST_DIR || entry === '.');

  if (covering === undefined) return { ok: false, detail: `"files" does not list ${MANIFEST_DIR}` };
  return { ok: true, detail: `"files" lists ${covering}` };
}

// region | Helpers

/** Reduces a `files` entry to the path it names, dropping the leading `./` and any trailing slash. */
function normalizeEntry(entry: string): string {
  const trimmed = entry.replace(/^\.\//, '').replace(/\/+$/, '');
  return trimmed === '' ? '.' : trimmed;
}

// endregion | Helpers
