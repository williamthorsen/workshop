import { describe, expect, it } from 'vitest';

import { buildClosure } from '../../../test-utils/buildClosure.ts';
import { requireEntry } from '../../../test-utils/requireEntry.ts';
import { collectResolutions } from '../collectResolutions.ts';

describe(collectResolutions, () => {
  it('locates each resolution by the path a violation against it is reported under', () => {
    expect(collectResolutions(buildClosure()).map(({ basePath }) => basePath)).toStrictEqual([
      'artifacts[0].resolution',
      'artifacts[1].resolution',
      'artifacts[2].resolution',
    ]);
  });

  it('passes through the resolution each artifact holds', () => {
    const closure = buildClosure();

    expect(requireEntry(collectResolutions(closure), 2).resolution).toStrictEqual(
      requireEntry(closure.artifacts, 2).resolution,
    );
  });
});
