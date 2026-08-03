import { describe, expect, it } from 'vitest';

import { IdSchema } from '../scalar-schemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

describe('IdSchema', () => {
  it('if the id is empty, rejects it at the root', () => {
    expect(findIssuePaths(IdSchema, '')).toStrictEqual([[]]);
  });
});
