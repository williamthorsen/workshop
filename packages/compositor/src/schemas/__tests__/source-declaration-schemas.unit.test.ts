import { describe, expect, it } from 'vitest';

import { DeclaredSourceSchema, SourceDeclarationSchema } from '../source-declaration-schemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

describe('DeclaredSourceSchema', () => {
  it.each([
    ['path', { name: 'local', path: './content' }, { kind: 'directory', location: './content' }],
    ['package', { name: 'acme', package: '@acme/guidance' }, { kind: 'package', location: '@acme/guidance' }],
  ])('normalizes an authored %s into a source origin', (_label, declared, origin) => {
    expect(DeclaredSourceSchema.parse(declared)).toStrictEqual({ name: declared.name, origin });
  });

  it('keeps the location as authored, so a plan reports what a consumer wrote', () => {
    expect(DeclaredSourceSchema.parse({ name: 'home', path: '~/guidance' })).toStrictEqual({
      name: 'home',
      origin: { kind: 'directory', location: '~/guidance' },
    });
  });

  it('rejects a source declaring both a path and a package', () => {
    const declared = { name: 'local', path: './content', package: '@acme/guidance' };

    expect(findIssuePaths(DeclaredSourceSchema, declared)).toBeDefined();
  });
});

describe('SourceDeclarationSchema', () => {
  it('defaults both lists to empty', () => {
    expect(SourceDeclarationSchema.parse({})).toStrictEqual({ use: [], drop: [] });
  });

  it('drops sources by name', () => {
    expect(SourceDeclarationSchema.parse({ drop: ['vendor'] })).toStrictEqual({ use: [], drop: ['vendor'] });
  });
});
