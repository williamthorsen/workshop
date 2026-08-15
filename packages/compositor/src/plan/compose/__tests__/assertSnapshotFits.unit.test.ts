import { describe, expect, it } from 'vitest';

import { StaleSnapshotError } from '../../../config/StaleSnapshotError.ts';
import { buildConfig } from '../../../test-utils/buildConfig.ts';
import { captureComposition } from '../../../test-utils/captureComposition.ts';
import { assertSnapshotFits } from '../assertSnapshotFits.ts';

describe(assertSnapshotFits, () => {
  it('accepts the config the snapshot was captured for', async () => {
    const { config, snapshot } = await captureComposition();

    expect(() => assertSnapshotFits(config, snapshot)).not.toThrow();
  });

  it('accepts a config that only moves a selection, which is the whole of the what-if envelope', async () => {
    const { config, snapshot } = await captureComposition();
    const edited = { ...config, tiers: config.tiers.map((tier) => ({ ...tier, select: [] })) };

    expect(() => assertSnapshotFits(edited, snapshot)).not.toThrow();
  });

  it('refuses a snapshot captured with the destination scan skipped', async () => {
    const { config, snapshot } = await captureComposition({ input: { shouldReadTargetState: false } });

    expect(() => assertSnapshotFits(config, snapshot)).toThrow(StaleSnapshotError);
    expect(() => assertSnapshotFits(config, snapshot)).toThrow(/captured without target state/);
  });

  it('refuses a config whose adopted sources have moved', async () => {
    const { snapshot } = await captureComposition();
    const dropped = buildConfig([{ id: 'project', sources: { use: [] } }]);

    expect(() => assertSnapshotFits(dropped, snapshot)).toThrow(/no longer adopts "team"/);
  });
});
