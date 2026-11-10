import { afterEach, describe, expect, it, vi } from 'vitest';

const mockLoadConfig = vi.hoisted(() => vi.fn());

vi.mock(import('../../config/loadConfig.ts'), async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/loadConfig.ts')>();
  return { ...actual, loadConfig: mockLoadConfig };
});

import { DEFAULT_CONFIG } from '../../config/loadConfig.ts';
import type { JsonListKitEntry } from '../../schemas/listOutputSchema.ts';
import { buildListOutput, loadListingConfig } from '../list-output.ts';

const KIT_WITH_CHECKS: JsonListKitEntry = {
  name: 'default',
  kind: 'compiled',
  checklists: ['setup'],
  checklistChecks: [{ checklist: 'setup', checks: ['has-readme'] }],
};

describe(buildListOutput, () => {
  it('strips the check names from every row without --checks', () => {
    const output = buildListOutput({ view: '', kits: [KIT_WITH_CHECKS] }, false);

    expect(output.kits).toStrictEqual([{ name: 'default', kind: 'compiled', checklists: ['setup'] }]);
  });

  it('keeps the check names under --checks', () => {
    const output = buildListOutput({ view: '', kits: [KIT_WITH_CHECKS] }, true);

    expect(output.kits).toStrictEqual([KIT_WITH_CHECKS]);
  });

  it('includes the available sources only when there are some', () => {
    expect(buildListOutput({ view: '', kits: [], availableSources: [] }, false)).not.toHaveProperty('availableSources');
    expect(buildListOutput({ view: '', kits: [], availableSources: ['npm:a'] }, false).availableSources).toStrictEqual([
      'npm:a',
    ]);
  });
});

describe(loadListingConfig, () => {
  afterEach(() => {
    mockLoadConfig.mockReset();
  });

  it('returns the loaded config without a warning', async () => {
    mockLoadConfig.mockResolvedValue({ ...DEFAULT_CONFIG, sources: [] });

    await expect(loadListingConfig(undefined)).resolves.toStrictEqual({
      config: { ...DEFAULT_CONFIG, sources: [] },
      warnings: [],
    });
  });

  it('falls back to the defaults with a warning that has no remedy when the failure has no hint', async () => {
    mockLoadConfig.mockRejectedValue(new Error('bad config'));

    const { config, warnings } = await loadListingConfig(undefined);

    expect(config).toStrictEqual(DEFAULT_CONFIG);
    expect(warnings).toStrictEqual([{ message: 'bad config. Listing with default settings.' }]);
  });

  it('gives the warning the failure’s hint as its remedy', async () => {
    mockLoadConfig.mockRejectedValue(Object.assign(new Error('bad config'), { hint: 'Fix the import.' }));

    const { warnings } = await loadListingConfig(undefined);

    expect(warnings).toStrictEqual([
      { message: 'bad config. Listing with default settings.', remedy: 'Fix the import.' },
    ]);
  });
});
