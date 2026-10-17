import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { makeFixture } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it as baseIt } from 'vitest';

import { buildKitImportUrl, importKitModule, KIT_IMPORT_PARAM } from '../importKitModule.ts';

// eslint-disable-next-line vitest/consistent-test-it -- the rule reads this builder call as a top-level test.
const it = baseIt.extend(
  'temp',
  makeFixture(() => createTempTree({}, { prefix: 'readyup-test-import-kit-' })),
);

describe(buildKitImportUrl, () => {
  it('returns a file URL that carries the kit marker', () => {
    const url = new URL(buildKitImportUrl('/kits/default.js'));

    expect(url.pathname).toBe('/kits/default.js');
    expect(url.searchParams.has(KIT_IMPORT_PARAM)).toBe(true);
  });

  it('returns a different URL for each call on one path', () => {
    expect(buildKitImportUrl('/kits/default.js')).not.toBe(buildKitImportUrl('/kits/default.js'));
  });
});

describe(importKitModule, () => {
  it('returns the exports of an ES-module kit file', async ({ temp }) => {
    const kitPath = temp.write(
      'kit.js',
      'export const __readyupVersion = "1.0.0";\nexport default { checklists: [] };\n',
    );

    const imported = await importKitModule(kitPath);

    expect(imported).toMatchObject({ __readyupVersion: '1.0.0', default: { checklists: [] } });
  });
});
