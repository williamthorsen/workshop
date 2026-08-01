import { describe, expect, it } from 'vitest';

import { findForeignSpecifiers } from '../../.readyup/kits/lib/buildSelfContainmentChecks.ts';

describe(findForeignSpecifiers, () => {
  it('accepts the specifiers rdy compile leaves external', () => {
    const bundle = [
      'import path from "node:path";',
      'import { defineRdyKit } from "readyup";',
      'import { fileExists } from "readyup/check-utils";',
      'export default { checklists: [] };',
    ].join('\n');

    expect(findForeignSpecifiers(bundle)).toStrictEqual([]);
  });

  it('names a package the consumer would have to supply', () => {
    const bundle = 'import picomatch from "picomatch";\n';

    expect(findForeignSpecifiers(bundle)).toStrictEqual(['picomatch']);
  });

  // A relative specifier survives only when the bundler failed to inline what it names, which leaves a
  // bundle that resolves against the publishing project's tree rather than the consumer's.
  it('names a relative specifier', () => {
    const bundle = 'import { helper } from "./lib/helper.js";\n';

    expect(findForeignSpecifiers(bundle)).toStrictEqual(['./lib/helper.js']);
  });

  it('names a re-export', () => {
    const bundle = 'export { helper } from "some-package";\n';

    expect(findForeignSpecifiers(bundle)).toStrictEqual(['some-package']);
  });

  it('names a side-effect-only import', () => {
    const bundle = 'import "polyfill-package";\n';

    expect(findForeignSpecifiers(bundle)).toStrictEqual(['polyfill-package']);
  });

  it('names a dynamic import wherever it sits on the line', () => {
    const bundle = 'const loaded = await import("lazy-package");\n';

    expect(findForeignSpecifiers(bundle)).toStrictEqual(['lazy-package']);
  });

  // esbuild preserves comments inside an expression, so documented examples reach the bundle. A scan
  // that read them would report a package no one imports.
  it('ignores a specifier-shaped example in a comment', () => {
    const bundle = [
      'const patterns = [',
      String.raw`  // \`import x from 'example-package'\``,
      String.raw`  /\bfrom\s*["']([^"']+)["']/g,`,
      '];',
    ].join('\n');

    expect(findForeignSpecifiers(bundle)).toStrictEqual([]);
  });

  it('reports each specifier once, sorted', () => {
    const bundle = [
      'import { b } from "zebra-package";',
      'import { a } from "alpha-package";',
      'import { c } from "zebra-package";',
    ].join('\n');

    expect(findForeignSpecifiers(bundle)).toStrictEqual(['alpha-package', 'zebra-package']);
  });
});
