import { describe, expect, it } from 'vitest';

import type { Plan } from '../../schemas/plan-schema.ts';
import { PlanSchema } from '../../schemas/plan-schema.ts';
import { buildSampleDocuments } from '../index.ts';

const documents = buildSampleDocuments().map((document) => [document.fileName, document.plan] as const);

describe('JSON round trip', () => {
  it.each(documents)('%s survives serialization and reparsing unchanged', (_fileName, plan) => {
    // eslint-disable-next-line unicorn/prefer-structured-clone -- passing through JSON is the property under test; a structured clone would not exercise it.
    expect(PlanSchema.parse(JSON.parse(JSON.stringify(plan)))).toStrictEqual(plan);
  });
});

describe('determinism', () => {
  it.each(documents)('%s orders its id-keyed tables lexicographically', (_fileName, plan) => {
    expect(collectUnsortedTables(plan)).toStrictEqual([]);
  });

  it.each(documents)('%s orders its files by target, then by path', (_fileName, plan) => {
    const keys = plan.files.map((file) => [file.targetId, file.path] as const);

    expect(keys).toStrictEqual(keys.toSorted(compareFileKeys));
  });

  it.each(documents)('%s keys its content table in hash order', (_fileName, plan) => {
    const hashes = Object.keys(plan.blobs);

    expect(hashes).toStrictEqual(hashes.toSorted(compareStrings));
  });
});

/** The name of each id-keyed table whose entries are not in lexicographic id order. */
function collectUnsortedTables(plan: Plan): Array<string> {
  const tables = [
    ['artifacts', plan.artifacts],
    ['kinds', plan.kinds],
    ['partials', plan.partials],
    ['targets', plan.targets],
  ] as const;

  return tables
    .filter(([, entries]) => {
      const ids = entries.map((entry) => entry.id);
      const sorted = ids.toSorted(compareStrings);
      return ids.some((id, index) => id !== sorted.at(index));
    })
    .map(([name]) => name);
}

/** Orders two files by target, then by path. */
function compareFileKeys(left: readonly [string, string], right: readonly [string, string]): number {
  return compareStrings(left[0], right[0]) || compareStrings(left[1], right[1]);
}

/** Orders two strings by code point, which is what a consumer diffing two plans reproduces. */
function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
