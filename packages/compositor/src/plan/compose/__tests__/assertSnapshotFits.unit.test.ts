import { describe, expect, it } from 'vitest';

import { StaleSnapshotError } from '../../../config/StaleSnapshotError.ts';
import { buildConfig } from '../../../test-utils/buildConfig.ts';
import { buildTempTree } from '../../../test-utils/buildTempTree.ts';
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

  it('refuses a config that adopts a source the snapshot does not carry', async () => {
    const { snapshot, sourceDir } = await captureComposition();
    const added = buildConfig([
      {
        id: 'project',
        sources: {
          use: [
            { name: 'team', path: sourceDir },
            { name: 'library', path: sourceDir },
          ],
        },
      },
    ]);

    expect(() => assertSnapshotFits(added, snapshot)).toThrow(StaleSnapshotError);
    expect(() => assertSnapshotFits(added, snapshot)).toThrow(/adopts "library"/);
  });

  it('refuses a config that drops a source the snapshot carries', async () => {
    const { snapshot } = await captureComposition();
    const dropped = buildConfig([{ id: 'project', sources: { use: [] } }]);

    expect(() => assertSnapshotFits(dropped, snapshot)).toThrow(/no longer adopts "team"/);
  });

  it('refuses a config that reorders its sources, order being what the catalog ranks candidates by', async () => {
    const library = await buildTempTree({ 'rulebooks/shared.md': 'Shared.\n' }, 'compositor-library');
    const { snapshot, sourceDir } = await captureComposition({
      buildSources: (dir) => ({
        use: [
          { name: 'team', path: dir },
          { name: 'library', path: library },
        ],
      }),
    });
    const reordered = buildConfig([
      {
        id: 'project',
        sources: {
          use: [
            { name: 'library', path: library },
            { name: 'team', path: sourceDir },
          ],
        },
      },
    ]);

    expect(() => assertSnapshotFits(reordered, snapshot)).toThrow(/where the snapshot has "team"/);
  });

  it('refuses a config that remaps a source to another directory', async () => {
    const { snapshot } = await captureComposition();
    const remapped = buildConfig([{ id: 'project', sources: { use: [{ name: 'team', path: '/srv/elsewhere' }] } }]);

    expect(() => assertSnapshotFits(remapped, snapshot)).toThrow(/where the snapshot has/);
  });

  it('refuses a snapshot captured with the destination scan skipped', async () => {
    const { config, snapshot } = await captureComposition({ input: { shouldReadTargetState: false } });

    expect(() => assertSnapshotFits(config, snapshot)).toThrow(/captured without target state/);
  });
});
