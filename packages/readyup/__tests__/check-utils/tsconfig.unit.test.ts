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

  it('reports a bare package specifier as unresolved without following it', () => {
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
