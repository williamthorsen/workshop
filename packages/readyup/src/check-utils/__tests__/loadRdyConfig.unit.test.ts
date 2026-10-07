import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { listRunnerExports } from '../../kitImports/listRunnerExports.ts';
import { loadRdyConfig } from '../loadRdyConfig.ts';

describe(loadRdyConfig, () => {
  it('reads the source lists from the config under the directory', async () => {
    using project = createTempTree(
      {
        '.config/readyup.config.ts': "export default { sources: ['npm:a-kit'], omittedSources: ['npm:b-kit'] };\n",
      },
      { prefix: 'load-rdy-config-' },
    );

    const config = await loadRdyConfig(project.dir);

    expect(config.sources.map((configured) => configured.spelling)).toStrictEqual(['npm:a-kit']);
    expect(config.omittedSources).toStrictEqual(['npm:b-kit']);
  });

  it('returns the defaults for a directory without a config', async () => {
    using project = createTempTree({}, { prefix: 'load-rdy-config-none-' });

    const config = await loadRdyConfig(project.dir);

    expect(config.sources).toStrictEqual([]);
    expect(config.omittedSources).toStrictEqual([]);
  });

  it('is a value export that a kit can bind', () => {
    expect(listRunnerExports('readyup/check-utils')).toContain('loadRdyConfig');
  });
});
