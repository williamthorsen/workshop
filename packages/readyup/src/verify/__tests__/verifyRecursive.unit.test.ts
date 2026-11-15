import { createTempTree, pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { hashBytes } from '../targetHash.ts';
import { collectEvents } from '../test-utils/collectEvents.ts';
import type { VerifyEvent } from '../verify-events.ts';
import { verifyRecursive } from '../verifyRecursive.ts';

const BUNDLE = 'export default {};';

/** A manifest recording one kit whose bundle is `BUNDLE`, unedited. */
const CLEAN_MANIFEST = JSON.stringify({
  version: 1,
  kits: [{ name: 'demo', path: 'kits/demo.js', targetHash: hashBytes(Buffer.from(BUNDLE)) }],
});

const FIXTURE_TREE = {
  // -- A repository whose middle project cannot be verified --

  'mixed/package.json': JSON.stringify({ name: 'mixed' }),
  'mixed/.readyup/kits/demo.js': BUNDLE,
  'mixed/.readyup/manifest.json': CLEAN_MANIFEST,

  'mixed/packages/invalid/package.json': JSON.stringify({ name: 'invalid' }),
  'mixed/packages/invalid/.readyup/kits/demo.js': BUNDLE,
  'mixed/packages/invalid/.readyup/manifest.json': '{ not json',

  'mixed/packages/sound/package.json': JSON.stringify({ name: 'sound' }),
  'mixed/packages/sound/.readyup/kits/demo.js': BUNDLE,
  'mixed/packages/sound/.readyup/manifest.json': CLEAN_MANIFEST,

  // -- A repository containing no kit project --

  'empty/package.json': JSON.stringify({ name: 'empty' }),
};

describe(verifyRecursive, () => {
  const it = baseIt.extend(
    'temp',
    makeFixture(() => createTempTree(FIXTURE_TREE, { prefix: 'rdy-verify-recursive-events-' })),
  );

  it('yields a failed project between the blocks of the projects around it', async ({ temp }) => {
    using _cwd = pointCwdAt(temp.resolve('mixed'));

    const { events } = await collectEvents(verifyRecursive({ shouldRebuild: false }));

    expect(events.map(describeEvent)).toStrictEqual([
      'discoveryFinished',
      'manifestStarted .readyup/manifest.json',
      'kitVerified',
      'manifestFinished',
      'projectFailed packages/invalid',
      'manifestStarted packages/sound/.readyup/manifest.json',
      'kitVerified',
      'manifestFinished',
      'verifyFinished',
    ]);
  });

  it('ends with an outcome that lists every project and fails the run', async ({ temp }) => {
    using _cwd = pointCwdAt(temp.resolve('mixed'));

    const { events } = await collectEvents(verifyRecursive({ shouldRebuild: false }));

    const last = events.at(-1);
    expect(last?.kind === 'verifyFinished' && last.outcome).toMatchObject({
      passed: false,
      projects: [
        { project: '.', passed: true },
        { project: 'packages/invalid', passed: false, error: expect.any(String) },
        { project: 'packages/sound', passed: true },
      ],
    });
  });

  it('ends an empty sweep with a passing outcome and an empty project list', async ({ temp }) => {
    using _cwd = pointCwdAt(temp.resolve('empty'));

    const { events } = await collectEvents(verifyRecursive({ shouldRebuild: false }));

    expect(events).toStrictEqual([
      { kind: 'discoveryFinished', warnings: [] },
      { kind: 'verifyFinished', outcome: { kits: [], passed: true, projects: [], uncompiled: [] } },
    ]);
  });
});

// region | Helpers

/** Returns an event's kind, followed by the path or project that places it in the sweep. */
function describeEvent(event: VerifyEvent): string {
  if (event.kind === 'manifestStarted') return `${event.kind} ${event.manifestPath}`;
  if (event.kind === 'projectFailed') return `${event.kind} ${event.project}`;
  return event.kind;
}

// endregion | Helpers
