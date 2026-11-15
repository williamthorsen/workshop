import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import type { RdyManifest } from '../../manifest/manifestSchema.ts';
import { collectEvents } from '../test-utils/collectEvents.ts';
import { createVerifyFakes } from '../test-utils/createVerifyFakes.ts';
import { verifyManifest, verifySingleManifest } from '../verify-manifest.ts';

const MANIFEST_PATH = path.resolve(process.cwd(), '.readyup/manifest.json');
const UNCOMPILED = { name: 'extra', source: 'kits/extra.ts' };

const MANIFEST: RdyManifest = {
  version: 1,
  kits: [
    { name: 'deploy', path: 'kits/deploy.js' },
    { name: 'release', path: 'kits/release.js' },
  ],
};

describe(verifyManifest, () => {
  it('yields the manifest, then each kit in order, then the close of the manifest', async () => {
    const fakes = createVerifyFakes();
    fakes.checkDrift.mockReturnValue({ kind: 'ok', targetHash: 'abc' });

    const { events } = await collectEvents(
      verifyManifest({ manifest: MANIFEST, manifestPath: MANIFEST_PATH, shouldRebuild: false, uncompiled: [] }, fakes),
    );

    expect(events.map((event) => event.kind)).toStrictEqual([
      'manifestStarted',
      'kitVerified',
      'kitVerified',
      'manifestFinished',
    ]);
    expect(events[0]).toStrictEqual({ kind: 'manifestStarted', kitCount: 2, manifestPath: '.readyup/manifest.json' });
    expect(events.slice(1, 3).map((event) => event.kind === 'kitVerified' && event.kit.name)).toStrictEqual([
      'deploy',
      'release',
    ]);
  });

  it('counts the failed kits and the uncompiled sources together when the manifest finishes', async () => {
    const fakes = createVerifyFakes();
    fakes.checkDrift
      .mockReturnValueOnce({ kind: 'drift', expected: 'abc', actual: 'def', resolvedPath: '/kits/deploy.js' })
      .mockReturnValueOnce({ kind: 'ok', targetHash: 'abc' });

    const { events, result } = await collectEvents(
      verifyManifest(
        { manifest: MANIFEST, manifestPath: MANIFEST_PATH, shouldRebuild: false, uncompiled: [UNCOMPILED] },
        fakes,
      ),
    );

    expect(events.at(-1)).toStrictEqual({
      kind: 'manifestFinished',
      failedCount: 2,
      totalCount: 3,
      uncompiled: [UNCOMPILED],
    });
    expect(result).toMatchObject({ passed: false, uncompiled: [UNCOMPILED] });
    expect(result.kits.map((kit) => kit.status)).toStrictEqual(['drift', 'ok']);
  });
});

describe(verifySingleManifest, () => {
  it('ends with the outcome of the manifest, without a project list', async () => {
    const fakes = createVerifyFakes();
    fakes.checkDrift.mockReturnValue({ kind: 'ok', targetHash: 'abc' });

    const { events } = await collectEvents(
      verifySingleManifest(
        { manifest: MANIFEST, manifestPath: MANIFEST_PATH, shouldRebuild: false, uncompiled: [] },
        fakes,
      ),
    );

    const last = events.at(-1);
    expect(last?.kind).toBe('verifyFinished');
    expect(last?.kind === 'verifyFinished' && last.outcome).toStrictEqual({
      kits: expect.any(Array),
      passed: true,
      uncompiled: [],
    });
  });
});
