import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { listRunnerExports } from '../listRunnerExports.ts';
import { scanReadyupImports } from '../scanReadyupImports.ts';

/** A compiled kit this package ships, standing in for the shape esbuild actually emits. */
const COMPILED_KIT_PATH = path.resolve(import.meta.dirname, '../../../.readyup/kits/publishing.js');

describe(scanReadyupImports, () => {
  it('finds imports in a later module section, not only those in the head block', async () => {
    const bundle = [
      '// kits/default.ts',
      'import { defineRdyKit } from "readyup";',
      'import { fileExists } from "readyup/check-utils";',
      '',
      'var head = 1;',
      '',
      '// kits/checks/late.ts',
      'import { readPackageJson } from "readyup/check-utils";',
      'var late = 2;',
    ].join('\n');

    const found = await scanReadyupImports(bundle);

    expect(found.flatMap((entry) => entry.names)).toStrictEqual(['defineRdyKit', 'fileExists', 'readPackageJson']);
  });

  it('reads a clause spanning several lines', async () => {
    const bundle = 'import {\n  commandExists,\n  fileExists,\n  readJsonValue\n} from "readyup/check-utils";\n';

    const found = await scanReadyupImports(bundle);

    expect(found).toStrictEqual([
      { specifier: 'readyup/check-utils', names: ['commandExists', 'fileExists', 'readJsonValue'] },
    ]);
  });

  it('finds every statement on a minified line', async () => {
    const bundle = 'import{a}from"readyup";import{b as c}from"readyup/check-utils";';

    const found = await scanReadyupImports(bundle);

    expect(found).toStrictEqual([
      { specifier: 'readyup', names: ['a'] },
      { specifier: 'readyup/check-utils', names: ['b'] },
    ]);
  });

  it('ignores import-shaped text in a comment or a string literal', async () => {
    const bundle = [
      '// import { fromComment } from "readyup";',
      'var pattern = \'import { fromString } from "readyup"\';',
      '/* import { fromBlock } from "readyup/check-utils"; */',
    ].join('\n');

    const found = await scanReadyupImports(bundle);

    expect(found).toStrictEqual([]);
  });

  it('takes the imported name rather than its local alias', async () => {
    const bundle = 'import { DEFAULT_MANIFEST_PATH as DEFAULT_MANIFEST_PATH3, defineRdyKit } from "readyup";';

    const found = await scanReadyupImports(bundle);

    expect(found[0]?.names).toStrictEqual(['DEFAULT_MANIFEST_PATH', 'defineRdyKit']);
  });

  it('reports the names a re-export imports', async () => {
    const bundle = 'export { fileExists } from "readyup/check-utils";';

    const found = await scanReadyupImports(bundle);

    expect(found).toStrictEqual([{ specifier: 'readyup/check-utils', names: ['fileExists'] }]);
  });

  it.each([
    ['a namespace import', 'import * as rdy from "readyup";'],
    ['a default import', 'import rdy from "readyup";'],
    ['a dynamic import', 'const rdy = await import("readyup");'],
    ['a side-effect import', 'import "readyup";'],
    ['a star re-export', 'export * from "readyup";'],
  ])('reports the specifier but no names for %s', async (_label, bundle) => {
    const found = await scanReadyupImports(bundle);

    expect(found).toStrictEqual([{ specifier: 'readyup', names: [] }]);
  });

  it('skips a default binding but keeps the named bindings beside it', async () => {
    const bundle = 'import rdy, { defineRdyKit } from "readyup";';

    const found = await scanReadyupImports(bundle);

    expect(found[0]?.names).toStrictEqual(['defineRdyKit']);
  });

  it('drops a specifier naming a JSON module', async () => {
    const bundle = 'import report from "readyup/schemas/report.v1.json" with { type: "json" };';

    const found = await scanReadyupImports(bundle);

    expect(found).toStrictEqual([]);
  });

  it('ignores specifiers outside the readyup package', async () => {
    const bundle = 'import path from "node:path";\nimport { x } from "readyup-adjacent";\n';

    const found = await scanReadyupImports(bundle);

    expect(found).toStrictEqual([]);
  });

  it('throws for source it cannot parse', async () => {
    await expect(scanReadyupImports('import { from "readyup";', 'broken.js')).rejects.toBeInstanceOf(Error);
  });

  it('binds only names the runner exports, across a real compiled kit', async () => {
    const bundle = readFileSync(COMPILED_KIT_PATH, 'utf8');

    const found = await scanReadyupImports(bundle, COMPILED_KIT_PATH);

    expect(found.length).toBeGreaterThan(0);
    const unresolvable = found.flatMap((entry) =>
      entry.names.filter((name) => listRunnerExports(entry.specifier)?.has(name) !== true),
    );
    expect(unresolvable).toStrictEqual([]);
  });
});
