import { describe, expect, it } from 'vitest';

import { OwnedItemsDeclarationSchema, OwnedItemsSpecSchema } from '../owned-items-schemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

const spec = {
  format: 'json',
  collection: ['hooks'],
  sentinel: { path: ['source'], value: 'codeassembly' },
};

const declaration = { ...spec, host: 'settings.json', items: [{ command: 'relay --on=stop' }] };

describe('OwnedItemsSpecSchema', () => {
  it('accepts a spec naming a format, a collection, and the mark on an owned item', () => {
    expect(OwnedItemsSpecSchema.parse(spec)).toStrictEqual(spec);
  });

  it('accepts a sentinel that branches over an array and matches by containment', () => {
    const buried = {
      ...spec,
      sentinel: { path: ['hooks', '*', 'command'], value: '--sentinel codeassembly', match: 'contains' },
    };

    expect(OwnedItemsSpecSchema.parse(buried)).toStrictEqual(buried);
  });

  it('rejects a collection path naming no key, which would name the document root', () => {
    expect(findIssuePaths(OwnedItemsSpecSchema, { ...spec, collection: [] })).toStrictEqual([['collection']]);
  });

  it('rejects a sentinel path naming no key, since a whole item cannot be its own mark', () => {
    expect(
      findIssuePaths(OwnedItemsSpecSchema, { ...spec, sentinel: { path: [], value: 'codeassembly' } }),
    ).toStrictEqual([['sentinel', 'path']]);
  });

  it('rejects a match mode it does not define', () => {
    const spelt = { ...spec, sentinel: { ...spec.sentinel, match: 'startsWith' } };

    expect(findIssuePaths(OwnedItemsSpecSchema, spelt)).toStrictEqual([['sentinel', 'match']]);
  });
});

describe('OwnedItemsDeclarationSchema', () => {
  it('accepts a declaration naming a host and the items it owns there', () => {
    expect(OwnedItemsDeclarationSchema.parse(declaration)).toStrictEqual(declaration);
  });

  it('accepts a declaration owning no items, which is how a target withdraws from a host', () => {
    const withdrawn = { ...declaration, items: [] };

    expect(OwnedItemsDeclarationSchema.parse(withdrawn)).toStrictEqual(withdrawn);
  });

  it('rejects a declaration naming no host', () => {
    expect(findIssuePaths(OwnedItemsDeclarationSchema, { ...declaration, host: '' })).toStrictEqual([['host']]);
  });

  it('produces a value the spec schema accepts, so a declaration is usable wherever a spec is', () => {
    const parsed = OwnedItemsDeclarationSchema.parse(declaration);

    expect(OwnedItemsSpecSchema.parse(parsed)).toStrictEqual(spec);
  });
});
