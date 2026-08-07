import { describe, expect, it } from 'vitest';

import { readTsconfigLanguageLevel } from '../../src/check-utils/tsconfig.ts';
import { useTempDir } from '../helpers/tempDir.ts';

const temp = useTempDir({ prefix: 'rdy-tsconfig-', cwd: 'mock' });

describe(readTsconfigLanguageLevel, () => {
  it('reads lib and target from a single config', () => {
    temp.writeJson('tsconfig.json', { compilerOptions: { lib: ['ES2025'], target: 'ES2025' } });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: ['es2025'],
      target: 'es2025',
      chain: ['tsconfig.json'],
      unresolvedExtends: [],
    });
  });

  it('reports lib and target as undefined when no config declares them', () => {
    temp.writeJson('tsconfig.json', { compilerOptions: { strict: true } });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.lib).toBeUndefined();
    expect(result?.target).toBeUndefined();
  });

  it('resolves lib and target through a relative extends chain', () => {
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

  it('lets a package config override the root config it extends', () => {
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

  it('appends .json to an extends specifier written without an extension', () => {
    temp.writeJson('base.json', { compilerOptions: { target: 'ES2022' } });
    temp.writeJson('tsconfig.json', { extends: './base' });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.target).toBe('es2022');
    expect(result?.chain).toStrictEqual(['tsconfig.json', 'base.json']);
  });

  it('gives a later array-extends entry precedence over an earlier one', () => {
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

  it('reads a shared parent once, along the higher-priority branch', () => {
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

  it('parses JSONC comments and trailing commas', () => {
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

  it('resolves a package subpath through the exports map that names it', () => {
    installPackage('@scoped/base', {
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

  it('resolves a package subpath when the package declares no exports map', () => {
    installPackage('plain-base', {
      'package.json': { name: 'plain-base' },
      'tsconfig.json': { compilerOptions: { target: 'ES2024' } },
    });
    temp.writeJson('tsconfig.json', { extends: 'plain-base/tsconfig.json' });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.target).toBe('es2024');
    expect(result?.chain).toStrictEqual(['tsconfig.json', 'node_modules/plain-base/tsconfig.json']);
  });

  it('appends .json to a package subpath written without an extension', () => {
    installPackage('plain-base', {
      'package.json': { name: 'plain-base' },
      'tsconfig.json': { compilerOptions: { target: 'ES2024' } },
    });
    temp.writeJson('tsconfig.json', { extends: 'plain-base/tsconfig' });

    expect(readTsconfigLanguageLevel('tsconfig.json')?.target).toBe('es2024');
  });

  it('resolves a bare package name to the config in the package root', () => {
    installPackage('plain-base', {
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

  it('resolves a bare package name through the tsconfig field of its manifest', () => {
    installPackage('field-base', {
      'package.json': { name: 'field-base', tsconfig: './configs/base.json' },
      'configs/base.json': { compilerOptions: { target: 'ES2019' } },
    });
    temp.writeJson('tsconfig.json', { extends: 'field-base' });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.target).toBe('es2019');
    expect(result?.chain).toStrictEqual(['tsconfig.json', 'node_modules/field-base/configs/base.json']);
  });

  it('resolves a bare package name through the "." entry of an exports map', () => {
    installPackage('@scoped/base', {
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

  it('reports a bare package name as unresolved when the exports map has no "." entry', () => {
    installPackage('@scoped/base', {
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

  it('reports a package subpath as unresolved when the exports map does not name it', () => {
    installPackage('@scoped/base', {
      'package.json': { name: '@scoped/base', exports: { './tsconfig.base.json': './tsconfig.base.json' } },
      'other.json': { compilerOptions: { target: 'ES2020' } },
    });
    temp.writeJson('tsconfig.json', { extends: '@scoped/base/other.json', compilerOptions: { lib: ['ES2025'] } });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.lib).toStrictEqual(['es2025']);
    expect(result?.unresolvedExtends).toStrictEqual(['@scoped/base/other.json']);
  });

  it('reports a package specifier as unresolved when the package is not installed', () => {
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

  it('reports a Node core module as unresolved', () => {
    temp.writeJson('tsconfig.json', { extends: 'path', compilerOptions: { target: 'ES2025' } });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: undefined,
      target: 'es2025',
      chain: ['tsconfig.json'],
      unresolvedExtends: ['path'],
    });
  });

  it('reports a Node core module subpath as unresolved', () => {
    temp.writeJson('tsconfig.json', { extends: 'fs/promises', compilerOptions: { target: 'ES2025' } });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toStrictEqual({
      lib: undefined,
      target: 'es2025',
      chain: ['tsconfig.json'],
      unresolvedExtends: ['fs/promises'],
    });
  });

  it('names the directory a symlinked package occupies rather than the link', () => {
    linkPackage('@scoped/base', {
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

  it('follows a symlinked package whose config extends a second symlinked package', () => {
    linkPackage('inner-base', {
      'package.json': { name: 'inner-base' },
      'tsconfig.json': { compilerOptions: { lib: ['ES2023'], target: 'ES2023' } },
    });
    linkPackage('outer-base', {
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

  it('reports a missing parent as unresolved', () => {
    temp.writeJson('tsconfig.json', { extends: './absent.json', compilerOptions: { lib: ['ES2025'] } });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.lib).toStrictEqual(['es2025']);
    expect(result?.unresolvedExtends).toStrictEqual(['./absent.json']);
  });

  it('reports a malformed parent as unresolved and keeps reading the rest of the chain', () => {
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

  it('stops at a cycle in the extends chain', () => {
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

  it('returns undefined when the entry file is malformed', () => {
    temp.write('tsconfig.json', '@@@ not json @@@');

    expect(readTsconfigLanguageLevel('tsconfig.json')).toBeUndefined();
  });

  it('returns undefined when the entry file holds a non-object', () => {
    temp.write('tsconfig.json', '["ES2025"]');

    expect(readTsconfigLanguageLevel('tsconfig.json')).toBeUndefined();
  });
});

// region | Helpers

/** Writes a package into the temporary directory's `node_modules`, one JSON file per entry of `files`. */
function installPackage(name: string, files: Record<string, unknown>): void {
  writePackageFiles(`node_modules/${name}`, files);
}

/** Writes a package outside `node_modules` and links it in, as a pnpm install does. */
function linkPackage(name: string, files: Record<string, unknown>): void {
  writePackageFiles(`store/${name}`, files);
  temp.symlinkDir(`node_modules/${name}`, `store/${name}`);
}

/** Writes each entry of `files` as JSON under `packageDir`. */
function writePackageFiles(packageDir: string, files: Record<string, unknown>): void {
  for (const [fileName, contents] of Object.entries(files)) {
    temp.writeJson(`${packageDir}/${fileName}`, contents);
  }
}

// endregion | Helpers
