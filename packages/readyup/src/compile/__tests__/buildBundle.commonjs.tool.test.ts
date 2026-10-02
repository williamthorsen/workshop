import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { buildBundle } from '../buildBundle.ts';

const IMPORT_SPECIFIER_PATTERN = /^[ \t]*import\b[^;]*?\bfrom\s*["']([^"']+)["']/gm;

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  { scope: 'file' },
  makeFixture(() =>
    createTempTree(
      {
        'cjs-kit.ts': [`import dep from 'cjs-dep';`, '', 'export const platform = dep.platform;'].join('\n'),
        'esm-kit.ts': [`import { readFileSync } from 'node:fs';`, '', 'export const kind = typeof readFileSync;'].join(
          '\n',
        ),
        'node_modules/cjs-dep/index.js': `module.exports = { platform: require('process').platform };\n`,
        'node_modules/cjs-dep/package.json': JSON.stringify({ name: 'cjs-dep', version: '1.0.0', main: 'index.js' }),
        // Anchors the compile on the fixture's own root rather than on whichever ancestor of the OS
        // temporary directory happens to contain a manifest.
        'package.json': JSON.stringify({ name: 'fixture', version: '1.0.0' }),
      },
      { prefix: 'commonjs-' },
    ),
  ),
);

describe('buildBundle with an inlined CommonJS dependency', () => {
  it('produces a bundle that loads under native import when the dependency requires a builtin', async ({ temp }) => {
    const { bytes } = await buildBundle(temp.resolve('cjs-kit.ts'));
    const bundlePath = temp.write('cjs-kit.mjs', bytes.toString('utf8'));

    // Load in a separate Node process: Vitest's module runner and jiti each supply a `require` of their own, and would
    // pass without the shim.
    const loader = `const kit = await import(${JSON.stringify(pathToFileURL(bundlePath).href)}); process.stdout.write(kit.platform);`;
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', loader], { encoding: 'utf8' });

    expect(output).toBe(process.platform);
  });

  it('imports only Node builtins in a bundle that requires one', async ({ temp }) => {
    const { bytes } = await buildBundle(temp.resolve('cjs-kit.ts'));

    const specifiers = bytes
      .toString('utf8')
      .matchAll(IMPORT_SPECIFIER_PATTERN)
      .map((match) => match[1])
      .toArray();

    expect(specifiers).not.toHaveLength(0);
    expect(specifiers.every((specifier) => specifier?.startsWith('node:'))).toBe(true);
  });

  it('leaves a bundle without an external require call free of the shim', async ({ temp }) => {
    const { bytes } = await buildBundle(temp.resolve('esm-kit.ts'));

    expect(bytes.toString('utf8')).not.toContain('createRequire');
  });
});
