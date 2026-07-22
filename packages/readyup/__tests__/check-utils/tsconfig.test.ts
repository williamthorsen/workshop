import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { readTsconfigLanguageLevel } from '../../src/check-utils/tsconfig.ts';

let tempDir: string;
let cwdSpy: MockInstance;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'rdy-tsconfig-'));
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  cwdSpy.mockRestore();
});

describe(readTsconfigLanguageLevel, () => {
  it('reads lib and target from a single config', () => {
    writeConfig('tsconfig.json', { compilerOptions: { lib: ['ES2025'], target: 'ES2025' } });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toEqual({
      lib: ['es2025'],
      target: 'es2025',
      chain: ['tsconfig.json'],
      unresolvedExtends: [],
    });
  });

  it('reports lib and target as undefined when no config declares them', () => {
    writeConfig('tsconfig.json', { compilerOptions: { strict: true } });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.lib).toBeUndefined();
    expect(result?.target).toBeUndefined();
  });

  it('resolves lib and target through a relative extends chain', () => {
    writeConfig('base.json', { compilerOptions: { lib: ['ES2023'], target: 'ES2023' } });
    writeConfig('middle.json', { extends: './base.json' });
    writeConfig('tsconfig.json', { extends: './middle.json' });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toEqual({
      lib: ['es2023'],
      target: 'es2023',
      chain: ['tsconfig.json', 'middle.json', 'base.json'],
      unresolvedExtends: [],
    });
  });

  it('lets a package config override the root config it extends', () => {
    writeConfig('tsconfig.json', { compilerOptions: { lib: ['ES2025'], target: 'ES2025' } });
    writeConfig('packages/alpha/tsconfig.json', {
      extends: '../../tsconfig.json',
      compilerOptions: { lib: ['ES2022'] },
    });

    expect(readTsconfigLanguageLevel('packages/alpha/tsconfig.json')).toEqual({
      // `target` is undeclared in the package config, so the root's value carries through.
      lib: ['es2022'],
      target: 'es2025',
      chain: ['packages/alpha/tsconfig.json', 'tsconfig.json'],
      unresolvedExtends: [],
    });
  });

  it('appends .json to an extends specifier written without an extension', () => {
    writeConfig('base.json', { compilerOptions: { target: 'ES2022' } });
    writeConfig('tsconfig.json', { extends: './base' });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.target).toBe('es2022');
    expect(result?.chain).toEqual(['tsconfig.json', 'base.json']);
  });

  it('gives a later array-extends entry precedence over an earlier one', () => {
    writeConfig('first.json', { compilerOptions: { lib: ['ES2021'], target: 'ES2021' } });
    writeConfig('second.json', { compilerOptions: { lib: ['ES2024'] } });
    writeConfig('tsconfig.json', { extends: ['./first.json', './second.json'] });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toEqual({
      lib: ['es2024'],
      target: 'es2021',
      chain: ['tsconfig.json', 'second.json', 'first.json'],
      unresolvedExtends: [],
    });
  });

  it('parses JSONC comments and trailing commas', () => {
    writeRawConfig(
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

    expect(readTsconfigLanguageLevel('tsconfig.json')).toEqual({
      lib: ['es2025'],
      target: 'es2025',
      chain: ['tsconfig.json'],
      unresolvedExtends: [],
    });
  });

  it('reports a bare package specifier as unresolved without following it', () => {
    writeConfig('tsconfig.json', {
      extends: '@tsconfig/node24/tsconfig.json',
      compilerOptions: { target: 'ES2025' },
    });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toEqual({
      lib: undefined,
      target: 'es2025',
      chain: ['tsconfig.json'],
      unresolvedExtends: ['@tsconfig/node24/tsconfig.json'],
    });
  });

  it('reports a missing parent as unresolved', () => {
    writeConfig('tsconfig.json', { extends: './absent.json', compilerOptions: { lib: ['ES2025'] } });

    const result = readTsconfigLanguageLevel('tsconfig.json');

    expect(result?.lib).toEqual(['es2025']);
    expect(result?.unresolvedExtends).toEqual(['./absent.json']);
  });

  it('reports a malformed parent as unresolved and keeps reading the rest of the chain', () => {
    writeRawConfig('broken.json', 'this is not a config at all');
    writeConfig('good.json', { compilerOptions: { target: 'ES2024' } });
    writeConfig('tsconfig.json', { extends: ['./broken.json', './good.json'] });

    expect(readTsconfigLanguageLevel('tsconfig.json')).toEqual({
      lib: undefined,
      target: 'es2024',
      chain: ['tsconfig.json', 'good.json'],
      unresolvedExtends: ['./broken.json'],
    });
  });

  it('stops at a cycle in the extends chain', () => {
    writeConfig('a.json', { extends: './b.json', compilerOptions: { target: 'ES2022' } });
    writeConfig('b.json', { extends: './a.json', compilerOptions: { lib: ['ES2022'] } });

    expect(readTsconfigLanguageLevel('a.json')).toEqual({
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
    writeRawConfig('tsconfig.json', '@@@ not json @@@');

    expect(readTsconfigLanguageLevel('tsconfig.json')).toBeUndefined();
  });

  it('returns undefined when the entry file holds a non-object', () => {
    writeRawConfig('tsconfig.json', '["ES2025"]');

    expect(readTsconfigLanguageLevel('tsconfig.json')).toBeUndefined();
  });
});

// region | Helpers

/** Writes a config as JSON at a temp-dir-relative path, creating parent directories as needed. */
function writeConfig(relativePath: string, content: Record<string, unknown>): void {
  writeRawConfig(relativePath, JSON.stringify(content));
}

/** Writes verbatim config text at a temp-dir-relative path, creating parent directories as needed. */
function writeRawConfig(relativePath: string, content: string): void {
  const fullPath = join(tempDir, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

// endregion | Helpers
