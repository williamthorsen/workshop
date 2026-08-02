import { describe, expect, it } from 'vitest';

import * as entry from '../index.ts';
import * as commonSchemas from '../schemas/common.ts';
import * as descriptorSchemas from '../schemas/descriptor-schemas.ts';
import * as fileSchemas from '../schemas/file-schemas.ts';
import * as graphSchemas from '../schemas/graph-schemas.ts';
import * as planSchema from '../schemas/plan-schema.ts';
import * as resolutionSchemas from '../schemas/resolution-schemas.ts';

const schemaModules: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['common', commonSchemas],
  ['descriptor-schemas', descriptorSchemas],
  ['file-schemas', fileSchemas],
  ['graph-schemas', graphSchemas],
  ['plan-schema', planSchema],
  ['resolution-schemas', resolutionSchemas],
];

describe('package entry', () => {
  it.each(schemaModules)('re-exports every runtime member of %s', (_label, module) => {
    const exported = new Set(Object.keys(entry));
    const missing = Object.keys(module).filter((name) => !exported.has(name));

    expect(missing).toStrictEqual([]);
  });
});
