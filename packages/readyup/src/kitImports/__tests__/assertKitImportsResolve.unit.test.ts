import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { assertKitImportsResolve } from '../assertKitImportsResolve.ts';
import { UnresolvableKitImportsError } from '../UnresolvableKitImportsError.ts';

/** The compiled kits this package ships, which must stay runnable against the readyup that builds them. */
const COMPILED_KIT_PATHS = ['default.js', 'publishing.js'].map((name) =>
  path.resolve(import.meta.dirname, '../../../.readyup/kits', name),
);

/** Runs the assertion and returns the findings it threw, failing the test when it did not throw. */
async function captureFindings(bundle: string) {
  try {
    await assertKitImportsResolve(bundle);
  } catch (error: unknown) {
    if (error instanceof UnresolvableKitImportsError) return error.findings;
    throw error;
  }
  throw new Error('expected assertKitImportsResolve to throw');
}

describe(assertKitImportsResolve, () => {
  it('resolves for a bundle importing only symbols the runner exports', async () => {
    const bundle = 'import { defineRdyKit } from "readyup";\nimport { fileExists } from "readyup/check-utils";\n';

    await expect(assertKitImportsResolve(bundle)).resolves.toBeUndefined();
  });

  it('resolves for a bundle importing nothing from readyup', async () => {
    await expect(assertKitImportsResolve('import path from "node:path";\n')).resolves.toBeUndefined();
  });

  it('reports a symbol the runner does not export', async () => {
    const findings = await captureFindings('import { fileExists } from "readyup";');

    expect(findings).toStrictEqual({
      unknownSubpaths: [],
      missing: [{ specifier: 'readyup', names: ['fileExists'] }],
    });
  });

  it('reports a subpath the runner does not publish', async () => {
    const findings = await captureFindings('import { anything } from "readyup/legacy";');

    expect(findings).toStrictEqual({ unknownSubpaths: ['readyup/legacy'], missing: [] });
  });

  it('merges misses of one specifier across separate module sections', async () => {
    const bundle = [
      'import { retiredHelper } from "readyup/check-utils";',
      'var a = 1;',
      'import { fileExists, movedHelper } from "readyup/check-utils";',
    ].join('\n');

    const findings = await captureFindings(bundle);

    expect(findings.missing).toStrictEqual([
      { specifier: 'readyup/check-utils', names: ['movedHelper', 'retiredHelper'] },
    ]);
  });

  it('reports every gap in one throw rather than the first', async () => {
    const bundle = [
      'import { legacyHelper } from "readyup";',
      'import { runGit } from "readyup";',
      'import { anything } from "readyup/legacy";',
    ].join('\n');

    const findings = await captureFindings(bundle);

    expect(findings).toStrictEqual({
      unknownSubpaths: ['readyup/legacy'],
      missing: [{ specifier: 'readyup', names: ['legacyHelper', 'runGit'] }],
    });
  });

  it('resolves for a namespace import, whose members cannot be read statically', async () => {
    await expect(assertKitImportsResolve('import * as rdy from "readyup";')).resolves.toBeUndefined();
  });

  it('reports an unknown subpath reached by namespace import', async () => {
    const findings = await captureFindings('import * as legacy from "readyup/legacy";');

    expect(findings.unknownSubpaths).toStrictEqual(['readyup/legacy']);
  });

  it.each(COMPILED_KIT_PATHS)('resolves for the compiled kit %s', async (kitPath) => {
    await expect(assertKitImportsResolve(readFileSync(kitPath, 'utf8'), kitPath)).resolves.toBeUndefined();
  });
});
