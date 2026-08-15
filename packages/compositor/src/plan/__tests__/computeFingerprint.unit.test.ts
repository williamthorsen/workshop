import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../config/loadConfig.ts';
import { StaleSnapshotError } from '../../config/StaleSnapshotError.ts';
import { buildConfigDir } from '../../config/test-utils/buildConfigDir.ts';
import { buildConfig } from '../../test-utils/buildConfig.ts';
import { captureComposition } from '../../test-utils/captureComposition.ts';
import { computeFingerprint } from '../computeFingerprint.ts';

describe(computeFingerprint, () => {
  it('names every source the snapshot digested, and every target it read', async () => {
    const { config, snapshot } = await captureComposition();
    const fingerprint = computeFingerprint(config, snapshot);

    expect(fingerprint.sources.map(({ sourceId }) => sourceId)).toStrictEqual(['team']);
    expect(fingerprint.targetState.map(({ targetId }) => targetId)).toStrictEqual(['claude']);
  });

  it('digests one composite over the config, the sources, and the target state', async () => {
    const { config, snapshot } = await captureComposition();

    expect(computeFingerprint(config, snapshot).composite).toMatch(/^sha256:/);
  });

  it('answers alike twice over one snapshot, which is what makes staleness one comparison', async () => {
    const { config, snapshot } = await captureComposition();

    expect(computeFingerprint(config, snapshot)).toStrictEqual(computeFingerprint(config, snapshot));
  });

  it('digests a config assembled in a different key order alike, a what-if edit rebuilding one', async () => {
    const { config, snapshot } = await captureComposition();
    const rebuilt = {
      tiers: config.tiers.map((tier) => ({
        select: tier.select,
        sources: tier.sources,
        shouldReset: tier.shouldReset,
        label: tier.label,
        id: tier.id,
        baseDir: tier.baseDir,
      })),
    };

    expect(computeFingerprint(rebuilt, snapshot).config).toBe(computeFingerprint(config, snapshot).config);
  });

  it('digests a config read from a file alike to the same config assembled in memory', async () => {
    const { snapshot, sourceDir } = await captureComposition();
    const dir = await buildConfigDir({
      'compositor.yaml': ['sources:', '  use:', `    - name: team`, `      path: ${sourceDir}`, ''].join('\n'),
    });
    const loaded = await loadConfig([{ id: 'project', label: 'project', path: path.join(dir, 'compositor.yaml') }]);
    const assembled = buildConfig([
      { id: 'project', baseDir: dir, sources: { use: [{ name: 'team', path: sourceDir }] } },
    ]);

    expect(computeFingerprint(loaded, snapshot).config).toBe(computeFingerprint(assembled, snapshot).config);
  });

  it('moves the composite when the config moves', async () => {
    const { config, snapshot } = await captureComposition();
    const edited = { ...config, tiers: config.tiers.map((tier) => ({ ...tier, select: [] })) };

    expect(computeFingerprint(edited, snapshot).composite).not.toBe(computeFingerprint(config, snapshot).composite);
  });

  it('refuses whatever composing refuses, a turned-away snapshot comparing against nothing', async () => {
    const { config, snapshot } = await captureComposition({ input: { shouldReadTargetState: false } });

    expect(() => computeFingerprint(config, snapshot)).toThrow(StaleSnapshotError);
  });

  it('refuses a config whose sources have moved away from the snapshot', async () => {
    const { snapshot } = await captureComposition();
    const remapped = buildConfig([{ id: 'project', sources: { use: [{ name: 'team', path: '/srv/elsewhere' }] } }]);

    expect(() => computeFingerprint(remapped, snapshot)).toThrow(StaleSnapshotError);
  });
});
