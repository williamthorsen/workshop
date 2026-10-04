import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { listRunnerExports } from '../../kitImports/listRunnerExports.ts';
import { loadRdyConfig } from '../loadRdyConfig.ts';

describe(loadRdyConfig, () => {
  it('reads the package lists from the config under the directory', async () => {
    using project = createTempTree(
      {
        '.config/readyup.config.ts': "export default { packages: ['a-kit'], omittedPackages: ['b-kit'] };\n",
      },
      { prefix: 'load-rdy-config-' },
    );

    const config = await loadRdyConfig(project.dir);

    expect(config.packages).toStrictEqual(['a-kit']);
    expect(config.omittedPackages).toStrictEqual(['b-kit']);
  });

  it('returns the defaults for a directory without a config', async () => {
    using project = createTempTree({}, { prefix: 'load-rdy-config-none-' });

    const config = await loadRdyConfig(project.dir);

    expect(config.packages).toStrictEqual([]);
    expect(config.omittedPackages).toStrictEqual([]);
  });

  it('is a value export that a kit can bind', () => {
    expect(listRunnerExports('readyup/check-utils')).toContain('loadRdyConfig');
  });
});
