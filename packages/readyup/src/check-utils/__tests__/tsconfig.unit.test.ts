import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, test } from 'vitest';

import { readTsconfigChain, readTsconfigLanguageLevel } from '../tsconfig.ts';

const it = test.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'rdy-tsconfig-' })),
);

it.aroundEach(async (runTest, { temp }) => {
  using _cwd = pointCwdAt(temp.dir);

  await runTest();
});

describe(readTsconfigChain, () => {
  it('reports a single config as one entry reached by no specifier', ({ temp }) => {
    temp.writeJson('tsconfig.json', { compilerOptions: { lib: ['ES2025'], target: 'ES2025' } });

    expect(readTsconfigChain('tsconfig.json')).toStrictEqual({
      entries: [
        {
          compilerOptions: { lib: ['ES2025'], target: 'ES2025' },
          config: { compilerOptions: { lib: ['ES2025'], target: 'ES2025' } },
          path: 'tsconfig.json',
          specifier: undefined,
        },
      ],
      unresolvedExtends: [],
    });
  });

  it('reports compilerOptions as empty when the config declares none', ({ temp }) => {
    temp.writeJson('tsconfig.json', { include: ['src'] });

    expect(readTsconfigChain('tsconfig.json')?.entries[0]?.compilerOptions).toStrictEqual({});
  });

  it('reports compilerOptions as empty when the declared value is not an object', ({ temp }) => {
    temp.writeJson('tsconfig.json', { compilerOptions: 'strict' });

    const entry = readTsconfigChain('tsconfig.json')?.entries[0];

    // The unusable value is still reachable through `config`, which reports the config as written.
    expect(entry?.compilerOptions).toStrictEqual({});
    expect(entry?.config).toStrictEqual({ compilerOptions: 'strict' });
  });

  it('reports raw values where the language-level reader reports normalized ones', ({ temp }) => {
    temp.writeJson('tsconfig.json', { compilerOptions: { target: 'ES2025' } });

    expect(readTsconfigChain('tsconfig.json')?.entries[0]?.compilerOptions['target']).toBe('ES2025');
    expect(readTsconfigLanguageLevel('tsconfig.json')?.target).toBe('es2025');
  });

  it('carries top-level fields that are not compilerOptions', ({ temp }) => {
    temp.writeJson('tsconfig.json', { files: ['vite.config.ts'], include: ['src'] });

    expect(readTsconfigChain('tsconfig.json')?.entries[0]?.config).toStrictEqual({
      files: ['vite.config.ts'],
      include: ['src'],
    });
  });

  it('records the extends specifier that reached each config, verbatim', ({ temp }) => {
    temp.writeJson('base.json', { compilerOptions: { target: 'ES2022' } });
    temp.writeJson('tsconfig.json', { extends: './base' });

    const entries = readTsconfigChain('tsconfig.json')?.entries;

    // Only `path` reflects the `.json` the resolver appended; the specifier stays as the config wrote it.
    expect(entries?.map((entry) => [entry.path, entry.specifier])).toStrictEqual([
      ['tsconfig.json', undefined],
      ['base.json', './base'],
    ]);
  });

  it('keeps the specifier stable where the path depends on install layout', ({ temp }) => {
    linkPackage(temp, '@scoped/base', {
      'package.json': { name: '@scoped/base', exports: { './tsconfig.base.json': './tsconfig.base.json' } },
      'tsconfig.base.json': { compilerOptions: { target: 'ES2025' } },
    });
    temp.writeJson('tsconfig.json', { extends: '@scoped/base/tsconfig.base.json' });

    const parent = readTsconfigChain('tsconfig.json')?.entries[1];

    // A symlinked package resolves to the directory it occupies, so only the specifier names the package.
    expect(parent?.path).toBe('store/@scoped/base/tsconfig.base.json');
    expect(parent?.specifier).toBe('@scoped/base/tsconfig.base.json');
  });

  it('reports only what each config declares in its own right', ({ temp }) => {
    temp.writeJson('base.json', { compilerOptions: { strict: true, target: 'ES2023' } });
    temp.writeJson('tsconfig.json', { extends: './base.json', compilerOptions: { lib: ['ES2023'] } });

    const entries = readTsconfigChain('tsconfig.json')?.entries;

    // The entry config declares no `target`, so nothing folds the base's value into its options.
    expect(entries?.map((entry) => entry.compilerOptions)).toStrictEqual([
      { lib: ['ES2023'] },
      { strict: true, target: 'ES2023' },
    ]);
  });

  it('orders entries so a nearer declaration precedes the one it overrides', ({ temp }) => {
    temp.writeJson('first.json', { compilerOptions: { target: 'ES2021' } });
    temp.writeJson('second.json', { compilerOptions: { target: 'ES2024' } });
    temp.writeJson('tsconfig.json', { extends: ['./first.json', './second.json'] });

    // A later `extends` entry outranks an earlier one, so `second` precedes `first`.
    expect(readTsconfigChain('tsconfig.json')?.entries.map((entry) => entry.path)).toStrictEqual([
      'tsconfig.json',
      'second.json',
      'first.json',
    ]);
  });

  it('reports a config reached through a diamond once, naming the branch that outranks', ({ temp }) => {
    temp.writeJson('base.json', { compilerOptions: { target: 'ES2021' } });
    temp.writeJson('low.json', { extends: './base' });
    temp.writeJson('high.json', { extends: './base.json' });
    temp.writeJson('tsconfig.json', { extends: ['./low.json', './high.json'] });

    const entries = readTsconfigChain('tsconfig.json')?.entries;

    // Both branches name the same file by different specifiers; `high` reaches it first and supplies the identity.
    expect(entries?.map((entry) => [entry.path, entry.specifier])).toStrictEqual([
      ['tsconfig.json', undefined],
      ['high.json', './high.json'],
      ['base.json', './base.json'],
      ['low.json', './low.json'],
    ]);
  });

  it('stops at a cycle, reporting each config once', ({ temp }) => {
    temp.writeJson('a.json', { extends: './b.json' });
    temp.writeJson('b.json', { extends: './a.json' });

    expect(readTsconfigChain('a.json')?.entries.map((entry) => entry.path)).toStrictEqual(['a.json', 'b.json']);
  });

  it('attributes an unresolvable specifier to the config that declared it', ({ temp }) => {
    temp.writeJson('middle.json', { extends: './absent.json' });
    temp.writeJson('tsconfig.json', { extends: './middle.json' });

    expect(readTsconfigChain('tsconfig.json')?.unresolvedExtends).toStrictEqual([
      { from: 'middle.json', specifier: './absent.json' },
    ]);
  });

  it('attributes an unparseable parent to the config that declared it', ({ temp }) => {
    temp.write('broken.json', 'this is not a config at all');
    temp.writeJson('middle.json', { extends: './broken.json' });
    temp.writeJson('tsconfig.json', { extends: './middle.json' });

    expect(readTsconfigChain('tsconfig.json')?.unresolvedExtends).toStrictEqual([
      { from: 'middle.json', specifier: './broken.json' },
    ]);
  });

  it('returns undefined when the entry file is missing', () => {
    expect(readTsconfigChain('tsconfig.json')).toBeUndefined();
  });

  it('returns undefined when the entry file is malformed', ({ temp }) => {
    temp.write('tsconfig.json', '@@@ not json @@@');

    expect(readTsconfigChain('tsconfig.json')).toBeUndefined();
  });

  it('returns undefined when the entry file holds a non-object', ({ temp }) => {
    temp.write('tsconfig.json', '["ES2025"]');

    expect(readTsconfigChain('tsconfig.json')).toBeUndefined();
  });
});

describe(readTsconfigLanguageLevel, () => {
  it('reads lib and target from a single config', ({ temp }) => {
    temp.writeJson('tsconfig.json', { compilerOptions: { lib: ['ES2025'], target: 'ES2025' } });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: ['es2025'],
      target: 'es2025',
      chain: ['tsconfig.json'],
      unresolvedExtends: [],
    });
  });

  it('reports lib and target as undefined when no config declares them', ({ temp }) => {
    temp.writeJson('tsconfig.json', { compilerOptions: { strict: true } });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.lib).toBeUndefined();
    expect(result?.target).toBeUndefined();
  });

  it('resolves lib and target through a relative extends chain', ({ temp }) => {
    temp.writeJson('base.json', { compilerOptions: { lib: ['ES2023'], target: 'ES2023' } });
    temp.writeJson('middle.json', { extends: './base.json' });
    temp.writeJson('tsconfig.json', { extends: './middle.json' });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: ['es2023'],
      target: 'es2023',
      chain: ['tsconfig.json', 'middle.json', 'base.json'],
      unresolvedExtends: [],
    });
  });

  it('lets a package config override the root config it extends', ({ temp }) => {
    temp.writeJson('tsconfig.json', { compilerOptions: { lib: ['ES2025'], target: 'ES2025' } });
    temp.writeJson('packages/alpha/tsconfig.json', {
      extends: '../../tsconfig.json',
      compilerOptions: { lib: ['ES2022'] },
    });

    expect(readTsconfigLanguageLevel('packages/alpha/tsconfig.json')).toStrictEqual({
      // `target` is undeclared in the package config, so the root's value carries through.
      lib: ['es2022'],
      target: 'es2025',
      chain: ['packages/alpha/tsconfig.json', 'tsconfig.json'],
      unresolvedExtends: [],
    });
  });

  it('appends .json to an extends specifier written without an extension', ({ temp }) => {
    temp.writeJson('base.json', { compilerOptions: { target: 'ES2022' } });
    temp.writeJson('tsconfig.json', { extends: './base' });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.target).toBe('es2022');
    expect(result?.chain).toStrictEqual(['tsconfig.json', 'base.json']);
  });

  it('gives a later array-extends entry precedence over an earlier one', ({ temp }) => {
    temp.writeJson('first.json', { compilerOptions: { lib: ['ES2021'], target: 'ES2021' } });
    temp.writeJson('second.json', { compilerOptions: { lib: ['ES2024'] } });
    temp.writeJson('tsconfig.json', { extends: ['./first.json', './second.json'] });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: ['es2024'],
      target: 'es2021',
      chain: ['tsconfig.json', 'second.json', 'first.json'],
      unresolvedExtends: [],
    });
  });

  it('reads a shared parent once, along the higher-priority branch', ({ temp }) => {
    temp.writeJson('base.json', { compilerOptions: { lib: ['ES2021'], target: 'ES2021' } });
    temp.writeJson('low.json', { extends: './base.json', compilerOptions: { target: 'ES2022' } });
    temp.writeJson('high.json', { extends: './base.json', compilerOptions: { target: 'ES2024' } });
    temp.writeJson('tsconfig.json', { extends: ['./low.json', './high.json'] });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      // `high` outranks `low`, so `base` is reached through it; `low` is visited with both fields already resolved.
      lib: ['es2021'],
      target: 'es2024',
      chain: ['tsconfig.json', 'high.json', 'base.json', 'low.json'],
      unresolvedExtends: [],
    });
  });

  it('parses JSONC comments and trailing commas', ({ temp }) => {
    temp.write(
      'tsconfig.json',
      [
        '// TSConfig for monorepo root',
        '{',
        '  "compilerOptions": {',
        '    "lib": ["ES2025"], // Keep aligned with the `engines` floor.',
        '    /* Block comments are legal too. */',
        '    "target": "ES2025",',
        '  },',
        '}',
        '',
      ].join('\n'),
    );

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: ['es2025'],
      target: 'es2025',
      chain: ['tsconfig.json'],
      unresolvedExtends: [],
    });
  });

  it('resolves a package subpath through the exports map that names it', ({ temp }) => {
    installPackage(temp, '@scoped/base', {
      'package.json': { name: '@scoped/base', exports: { './tsconfig.base.json': './tsconfig.base.json' } },
      'tsconfig.base.json': { compilerOptions: { lib: ['ES2025'], target: 'ES2025' } },
    });
    temp.writeJson('tsconfig.json', { extends: '@scoped/base/tsconfig.base.json' });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: ['es2025'],
      target: 'es2025',
      chain: ['tsconfig.json', 'node_modules/@scoped/base/tsconfig.base.json'],
      unresolvedExtends: [],
    });
  });

  it('resolves a package subpath when the package declares no exports map', ({ temp }) => {
    installPackage(temp, 'plain-base', {
      'package.json': { name: 'plain-base' },
      'tsconfig.json': { compilerOptions: { target: 'ES2024' } },
    });
    temp.writeJson('tsconfig.json', { extends: 'plain-base/tsconfig.json' });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.target).toBe('es2024');
    expect(result?.chain).toStrictEqual(['tsconfig.json', 'node_modules/plain-base/tsconfig.json']);
  });

  it('appends .json to a package subpath written without an extension', ({ temp }) => {
    installPackage(temp, 'plain-base', {
      'package.json': { name: 'plain-base' },
      'tsconfig.json': { compilerOptions: { target: 'ES2024' } },
    });
    temp.writeJson('tsconfig.json', { extends: 'plain-base/tsconfig' });

    expect(readTsconfigLanguageLevel('tsconfig.json')?.target).toBe('es2024');
  });

  it('resolves a bare package name to the config in the package root', ({ temp }) => {
    installPackage(temp, 'plain-base', {
      'package.json': { name: 'plain-base' },
      'tsconfig.json': { compilerOptions: { lib: ['ES2024'], target: 'ES2024' } },
    });
    temp.writeJson('tsconfig.json', { extends: 'plain-base' });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: ['es2024'],
      target: 'es2024',
      chain: ['tsconfig.json', 'node_modules/plain-base/tsconfig.json'],
      unresolvedExtends: [],
    });
  });

  it('resolves a bare package name through the tsconfig field of its manifest', ({ temp }) => {
    installPackage(temp, 'field-base', {
      'package.json': { name: 'field-base', tsconfig: './configs/base.json' },
      'configs/base.json': { compilerOptions: { target: 'ES2019' } },
    });
    temp.writeJson('tsconfig.json', { extends: 'field-base' });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.target).toBe('es2019');
    expect(result?.chain).toStrictEqual(['tsconfig.json', 'node_modules/field-base/configs/base.json']);
  });

  it('resolves a bare package name through the "." entry of an exports map', ({ temp }) => {
    installPackage(temp, '@scoped/base', {
      'package.json': { name: '@scoped/base', exports: { '.': './tsconfig.json' } },
      'tsconfig.json': { compilerOptions: { lib: ['ES2018'], target: 'ES2018' } },
    });
    temp.writeJson('tsconfig.json', { extends: '@scoped/base' });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: ['es2018'],
      target: 'es2018',
      chain: ['tsconfig.json', 'node_modules/@scoped/base/tsconfig.json'],
      unresolvedExtends: [],
    });
  });

  it('lets the "." entry of an exports map outrank the manifest tsconfig field', ({ temp }) => {
    installPackage(temp, 'both-base', {
      'package.json': { name: 'both-base', exports: { '.': './declared.json' }, tsconfig: './field.json' },
      'declared.json': { compilerOptions: { target: 'ES2015' } },
      'field.json': { compilerOptions: { target: 'ES2014' } },
    });
    temp.writeJson('tsconfig.json', { extends: 'both-base' });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.target).toBe('es2015');
    expect(result?.chain).toStrictEqual(['tsconfig.json', 'node_modules/both-base/declared.json']);
  });

  it('reads past a null exports map to the config in the package root', ({ temp }) => {
    installPackage(temp, 'null-base', {
      'package.json': { name: 'null-base', exports: null, main: './index.js' },
      'tsconfig.json': { compilerOptions: { target: 'ES2016' } },
    });
    // A resolvable `main` stands in the way, so reaching the root config is what proves the map is read past.
    temp.write('node_modules/null-base/index.js', 'module.exports = {};\n');
    temp.writeJson('tsconfig.json', { extends: 'null-base' });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.target).toBe('es2016');
    expect(result?.chain).toStrictEqual(['tsconfig.json', 'node_modules/null-base/tsconfig.json']);
  });

  it('reports a package whose entry point is not a config as unresolved', ({ temp }) => {
    installPackage(temp, 'js-base', { 'package.json': { name: 'js-base', exports: { '.': './index.js' } } });
    // The parser recovers an empty record from JavaScript source, so only the resolver can reject this.
    temp.write('node_modules/js-base/index.js', 'module.exports = {};\n');
    temp.writeJson('tsconfig.json', { extends: 'js-base', compilerOptions: { target: 'ES2025' } });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: undefined,
      target: 'es2025',
      chain: ['tsconfig.json'],
      unresolvedExtends: ['js-base'],
    });
  });

  it('reports a bare package name as unresolved when the exports map has no "." entry', ({ temp }) => {
    installPackage(temp, '@scoped/base', {
      'package.json': { name: '@scoped/base', exports: { './tsconfig.base.json': './tsconfig.base.json' } },
      // Present so the refusal is attributable to the exports map rather than to a missing file.
      'tsconfig.json': { compilerOptions: { target: 'ES2020' } },
    });
    temp.writeJson('tsconfig.json', { extends: '@scoped/base', compilerOptions: { target: 'ES2025' } });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: undefined,
      target: 'es2025',
      chain: ['tsconfig.json'],
      unresolvedExtends: ['@scoped/base'],
    });
  });

  it('reports a package subpath as unresolved when the exports map does not name it', ({ temp }) => {
    installPackage(temp, '@scoped/base', {
      'package.json': { name: '@scoped/base', exports: { './tsconfig.base.json': './tsconfig.base.json' } },
      'other.json': { compilerOptions: { target: 'ES2020' } },
    });
    temp.writeJson('tsconfig.json', { extends: '@scoped/base/other.json', compilerOptions: { lib: ['ES2025'] } });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.lib).toStrictEqual(['es2025']);
    expect(result?.unresolvedExtends).toStrictEqual(['@scoped/base/other.json']);
  });

  it('reports a package specifier as unresolved when the package is not installed', ({ temp }) => {
    temp.writeJson('tsconfig.json', {
      extends: '@tsconfig/node24/tsconfig.json',
      compilerOptions: { target: 'ES2025' },
    });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: undefined,
      target: 'es2025',
      chain: ['tsconfig.json'],
      unresolvedExtends: ['@tsconfig/node24/tsconfig.json'],
    });
  });

  it('reports a Node core module as unresolved', ({ temp }) => {
    temp.writeJson('tsconfig.json', { extends: 'path', compilerOptions: { target: 'ES2025' } });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: undefined,
      target: 'es2025',
      chain: ['tsconfig.json'],
      unresolvedExtends: ['path'],
    });
  });

  it('reports a Node core module subpath as unresolved', ({ temp }) => {
    temp.writeJson('tsconfig.json', { extends: 'fs/promises', compilerOptions: { target: 'ES2025' } });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: undefined,
      target: 'es2025',
      chain: ['tsconfig.json'],
      unresolvedExtends: ['fs/promises'],
    });
  });

  it('names the directory a symlinked package occupies rather than the link', ({ temp }) => {
    linkPackage(temp, '@scoped/base', {
      'package.json': { name: '@scoped/base', exports: { './tsconfig.base.json': './tsconfig.base.json' } },
      'tsconfig.base.json': { compilerOptions: { lib: ['ES2025'], target: 'ES2025' } },
    });
    temp.writeJson('tsconfig.json', { extends: '@scoped/base/tsconfig.base.json' });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: ['es2025'],
      target: 'es2025',
      chain: ['tsconfig.json', 'store/@scoped/base/tsconfig.base.json'],
      unresolvedExtends: [],
    });
  });

  it('follows a symlinked package whose config extends a second symlinked package', ({ temp }) => {
    linkPackage(temp, 'inner-base', {
      'package.json': { name: 'inner-base' },
      'tsconfig.json': { compilerOptions: { lib: ['ES2023'], target: 'ES2023' } },
    });
    linkPackage(temp, 'outer-base', {
      'package.json': { name: 'outer-base' },
      'tsconfig.json': { extends: 'inner-base' },
    });
    temp.writeJson('tsconfig.json', { extends: 'outer-base' });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: ['es2023'],
      target: 'es2023',
      chain: ['tsconfig.json', 'store/outer-base/tsconfig.json', 'store/inner-base/tsconfig.json'],
      unresolvedExtends: [],
    });
  });

  it('reports a missing parent as unresolved', ({ temp }) => {
    temp.writeJson('tsconfig.json', { extends: './absent.json', compilerOptions: { lib: ['ES2025'] } });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.lib).toStrictEqual(['es2025']);
    expect(result?.unresolvedExtends).toStrictEqual(['./absent.json']);
  });

  it('reports a malformed parent as unresolved and keeps reading the rest of the chain', ({ temp }) => {
    temp.write('broken.json', 'this is not a config at all');
    temp.writeJson('good.json', { compilerOptions: { target: 'ES2024' } });
    temp.writeJson('tsconfig.json', { extends: ['./broken.json', './good.json'] });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: undefined,
      target: 'es2024',
      chain: ['tsconfig.json', 'good.json'],
      unresolvedExtends: ['./broken.json'],
    });
  });

  it('stops at a cycle in the extends chain', ({ temp }) => {
    temp.writeJson('a.json', { extends: './b.json', compilerOptions: { target: 'ES2022' } });
    temp.writeJson('b.json', { extends: './a.json', compilerOptions: { lib: ['ES2022'] } });

    expect(readTsconfigLanguageLevel('a.json')).toStrictEqual({
      lib: ['es2022'],
      target: 'es2022',
      chain: ['a.json', 'b.json'],
      unresolvedExtends: [],
    });
  });

  it('returns undefined when the entry file is missing', () => {
    expect(readTsconfigLanguageLevel('tsconfig.json')).toBeUndefined();
  });

  it('returns undefined when the entry file is malformed', ({ temp }) => {
    temp.write('tsconfig.json', '@@@ not json @@@');

    expect(readTsconfigLanguageLevel('tsconfig.json')).toBeUndefined();
  });

  it('returns undefined when the entry file holds a non-object', ({ temp }) => {
    temp.write('tsconfig.json', '["ES2025"]');

    expect(readTsconfigLanguageLevel('tsconfig.json')).toBeUndefined();
  });
});

// region | Helpers

/** Writes a package into the temporary directory's `node_modules`, one JSON file per entry of `files`. */
function installPackage(temp: TempTree, name: string, files: Record<string, unknown>): void {
  writePackageFiles(temp, `node_modules/${name}`, files);
}

/** Writes a package outside `node_modules` and links it in, as a pnpm install does. */
function linkPackage(temp: TempTree, name: string, files: Record<string, unknown>): void {
  writePackageFiles(temp, `store/${name}`, files);
  temp.symlink(`node_modules/${name}`, temp.resolve(`store/${name}`));
}

/** Writes each entry of `files` as JSON under `packageDir`. */
function writePackageFiles(temp: TempTree, packageDir: string, files: Record<string, unknown>): void {
  for (const [fileName, contents] of Object.entries(files)) {
    temp.writeJson(`${packageDir}/${fileName}`, contents);
  }
}

// endregion | Helpers
