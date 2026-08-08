import { describe, expect, it } from 'vitest';

import { getEngineVersion } from '../getEngineVersion.ts';
import { readManifestVersion } from '../test-utils/readManifestVersion.ts';

describe(getEngineVersion, () => {
  it('reports the version the package manifest declares', async () => {
    expect(getEngineVersion()).toBe(await readManifestVersion());
  });
});
