import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildClosure } from '../../test-utils/buildClosure.ts';
import { requireEntry } from '../../test-utils/requireEntry.ts';
import { ClosureArtifactSchema, ClosureSchema } from '../closure-schemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

describe('ClosureSchema', () => {
  it('accepts a closure containing an aggregate, a diamond, a shadowed candidate, and a diagnostic', () => {
    expect(ClosureSchema.parse(buildClosure())).toStrictEqual(buildClosure());
  });

  it('round-trips through JSON, so a reader parses back what the engine wrote', () => {
    const closure = buildClosure();

    // eslint-disable-next-line unicorn/prefer-structured-clone -- passing through JSON is the property under test; a structured clone would not exercise it.
    expect(ClosureSchema.parse(JSON.parse(JSON.stringify(closure)))).toStrictEqual(closure);
  });

  it('if a diagnostic names a code outside the known set, rejects it for that field', () => {
    const closure = buildClosure();
    const broken = { ...closure, diagnostics: [{ ...requireEntry(closure.diagnostics, 0), code: 'surprise' }] };

    expect(findIssuePaths(ClosureSchema, broken)).toStrictEqual([['diagnostics', 0, 'code']]);
  });

  // Objects stay open so a consumer pinned to this version accepts a payload containing a field added later.
  it('accepts a closure containing an unrecognized key, and strips it', () => {
    expect(ClosureSchema.parse({ ...buildClosure(), addedLater: 'ignored' })).toStrictEqual(buildClosure());
  });

  it('renders to JSON Schema, so a published document describes what this package accepts', () => {
    expect(z.toJSONSchema(ClosureSchema).$defs).toHaveProperty(['ClosureArtifact']);
  });
});

describe('ClosureArtifactSchema', () => {
  it('has no status, a closure having measured nothing against a target', () => {
    const artifact = requireEntry(buildClosure().artifacts, 0);

    expect(ClosureArtifactSchema.parse({ ...artifact, status: 'added' })).not.toHaveProperty('status');
  });

  it('uses the seed and edge shapes a plan records, so neither can drift from the other', () => {
    const artifact = requireEntry(buildClosure().artifacts, 0);

    expect(ClosureArtifactSchema.parse(artifact)).toStrictEqual(artifact);
  });
});
