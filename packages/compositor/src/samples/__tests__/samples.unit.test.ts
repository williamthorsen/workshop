import { describe, expect, it } from 'vitest';

import { assertPlanIsConsistent } from '../../plan/assertPlanIsConsistent.ts';
import { PlanSchema } from '../../schemas/plan-schemas.ts';
import { buildSampleDocuments } from '../sample-documents.ts';

const documents = buildSampleDocuments().map((document) => [document.fileName, document] as const);

describe('published samples', () => {
  it.each(documents)('%s validates against the plan schema', (_fileName, { plan }) => {
    expect(PlanSchema.parse(plan)).toStrictEqual(plan);
  });

  it.each(documents)('%s satisfies every consistency invariant', (_fileName, { plan }) => {
    expect(() => {
      assertPlanIsConsistent(plan);
    }).not.toThrow();
  });
});
