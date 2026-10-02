import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { buildBundle } from '../buildBundle.ts';

const IMPORT_SPECIFIER_PATTERN = /^[ \t]*import\b[^;]*?\bfrom\s*["']([^"']+)["']/gm;

/** CommonJS dependencies that reach esbuild's `__require` helper, each with the value that its kit exports. */
const REQUIRING_DEPENDENCIES = [
  {
    name: 'literal-dep',
    shape: 'a require naming a builtin',
    source: `module.exports = { value: require('process').platform };\n`,
    expected: process.platform,
  },
  {
    name: 'computed-dep',
    shape: 'a require with a computed specifier',
    source: `const name = ['pro', 'cess'].join('');\nmodule.exports = { value: require(name).platform };\n`,
    expected: process.platform,
  },
  {
    name: 'resolve-dep',
    shape: 'require.resolve',
    source: `module.exports = { value: require.resolve('fs') };\n`,
    expected: 'fs',
  },
];

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  { scope: 'file' },
  makeFixture(() =>
    createTempTree(
      {
        ...Object.fromEntries(
          REQUIRING_DEPENDENCIES.flatMap(({ name, source }) => [
            [`${name}.ts`, `import dep from '${name}';\n\nexport const value = dep.value;\n`],
            ...packageEntries(name, source),
          ]),
        ),
        'esm-kit.ts': `import { readFileSync } from 'node:fs';\n\nexport const value = typeof readFileSync;\n`,
        // `using` lowers through esbuild helpers other than `__require`.
        'using-kit.ts': `export function value(): void {\n  using resource = { [Symbol.dispose]() {} };\n  void resource;\n}\n`,
        'local-dep.ts': `import dep from 'local-dep';\n\nexport const value = dep.value;\n`,
        ...Object.fromEntries(
          packageEntries('local-dep', `module.exports = { value: require('./helper.js').value };\n`),
        ),
        'node_modules/local-dep/helper.js': `module.exports = { value: 'local' };\n`,
        // Anchors the compile on the fixture's own root rather than on whichever ancestor of the OS
        // temporary directory happens to contain a manifest.
        'package.json': JSON.stringify({ name: 'fixture', version: '1.0.0' }),
      },
      { prefix: 'commonjs-' },
    ),
  ),
);

describe('buildBundle require shim', () => {
  it.for(REQUIRING_DEPENDENCIES)(
    'produces a bundle that loads under native import when the dependency uses $shape',
    async ({ name, expected }, { temp }) => {
      const { bytes } = await buildBundle(temp.resolve(`${name}.ts`));
      const bundlePath = temp.write(`${name}.mjs`, bytes.toString('utf8'));

      // Load in a separate Node process: Vitest's module runner and jiti each supply a `require` of their own, and
      // would pass without the shim.
      const loader = `const kit = await import(${JSON.stringify(pathToFileURL(bundlePath).href)}); process.stdout.write(kit.value);`;
      const output = execFileSync(process.execPath, ['--input-type=module', '--eval', loader], { encoding: 'utf8' });

      expect(output).toBe(expected);
    },
  );

  it('imports only Node builtins in a bundle that requires one', async ({ temp }) => {
    const { bytes } = await buildBundle(temp.resolve('literal-dep.ts'));

    const specifiers = bytes
      .toString('utf8')
      .matchAll(IMPORT_SPECIFIER_PATTERN)
      .map((match) => match[1])
      .toArray();

    expect(specifiers).not.toHaveLength(0);
    expect(specifiers.every((specifier) => specifier?.startsWith('node:'))).toBe(true);
  });

  it.for(['esm-kit', 'local-dep', 'using-kit'])(
    'leaves the %s bundle, which never reaches __require, free of the shim',
    async (name, { temp }) => {
      const { bytes } = await buildBundle(temp.resolve(`${name}.ts`));

      expect(bytes.toString('utf8')).not.toContain('createRequire');
    },
  );
});

// region | Helpers

/** Returns the tree entries for a CommonJS package under `node_modules` whose entry point contains `source`. */
function packageEntries(name: string, source: string): Array<[path: string, content: string]> {
  return [
    [`node_modules/${name}/index.js`, source],
    [`node_modules/${name}/package.json`, JSON.stringify({ name, version: '1.0.0', main: 'index.js' })],
  ];
}

// endregion | Helpers
