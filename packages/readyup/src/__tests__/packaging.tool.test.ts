import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

const packageDir = path.resolve(import.meta.dirname, '../..');

/**
 * Guards what the published tarball carries.
 *
 * This is the only check that exercises `files`: every other check here resolves readyup's guidance through a
 * `workspace:*` self-link to the live source tree, so a dropped `agents` entry breaks registry installs alone.
 */
describe('published tarball', () => {
  let packedPaths: Array<string>;

  beforeAll(() => {
    packedPaths = listPackedPaths();
  }, 120_000);

  it('carries the CodeAssembly content root declared by codeassembly.content', () => {
    expect(packedPaths).toContain('agents/guidance/rulebooks/readyup-kits.md');
  });
});

// region | Helpers

/**
 * Returns the package-root-relative paths `pnpm pack` would publish. Scripts are skipped so `prepare` does not
 * regenerate schemas, compile the package, and recompile every kit: nothing asserted here reads that output, and
 * producing it would rewrite the working tree as a side effect of a question about `files`. `pnpm pack` rejects a
 * bare `--ignore-scripts`, hence the `--config` form.
 */
function listPackedPaths(): Array<string> {
  const stdout = execFileSync('pnpm', ['pack', '--dry-run', '--json', '--config.ignore-scripts=true'], {
    cwd: packageDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  const parsed: unknown = JSON.parse(stdout);
  if (!isPackReport(parsed)) {
    throw new Error(`pnpm pack --json returned no file list: ${stdout}`);
  }
  return parsed.files.map((file) => file.path);
}

/** Narrows `pnpm pack --json` output to the one field this test reads. */
function isPackReport(value: unknown): value is { files: Array<{ path: string }> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'files' in value &&
    Array.isArray(value.files) &&
    value.files.every(
      (file: unknown) => typeof file === 'object' && file !== null && 'path' in file && typeof file.path === 'string',
    )
  );
}

// endregion | Helpers
