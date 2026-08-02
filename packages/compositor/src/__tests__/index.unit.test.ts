import { describe, expect, it } from 'vitest';

import * as entry from '../index.ts';
import * as assertPlanIsConsistent from '../plan/assertPlanIsConsistent.ts';
import * as traversal from '../plan/traversal.ts';
import * as assertCatalogIsConsistent from '../resolution/assertCatalogIsConsistent.ts';
import * as composeArtifactId from '../resolution/composeArtifactId.ts';
import * as enumerateSource from '../resolution/enumerateSource.ts';
import * as resolveCatalog from '../resolution/resolveCatalog.ts';
import * as commonSchemas from '../schemas/common.ts';
import * as descriptorSchemas from '../schemas/descriptor-schemas.ts';
import * as fileSchemas from '../schemas/file-schemas.ts';
import * as graphSchemas from '../schemas/graph-schemas.ts';
import * as planSchema from '../schemas/plan-schema.ts';
import * as resolutionSchemas from '../schemas/resolution-schemas.ts';

// Every module the entry publishes in full. `portable/`, `resolution/assertSourceIsReadable.ts`, and
// `resolution/findResolutionOrderViolations.ts` are engine internals the entry publishes nothing from, so they are
// absent rather than overlooked.
const publishedModules: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['common', commonSchemas],
  ['descriptor-schemas', descriptorSchemas],
  ['file-schemas', fileSchemas],
  ['graph-schemas', graphSchemas],
  ['plan-schema', planSchema],
  ['resolution-schemas', resolutionSchemas],
  ['assertCatalogIsConsistent', assertCatalogIsConsistent],
  ['assertPlanIsConsistent', assertPlanIsConsistent],
  ['composeArtifactId', composeArtifactId],
  ['enumerateSource', enumerateSource],
  ['resolveCatalog', resolveCatalog],
  ['traversal', traversal],
];

describe('package entry', () => {
  it.each(publishedModules)('re-exports every runtime member of %s', (_label, module) => {
    const exported = new Set(Object.keys(entry));
    const missing = Object.keys(module).filter((name) => !exported.has(name));

    expect(missing).toStrictEqual([]);
  });
});
