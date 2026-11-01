import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { findEnvFileOverrides } from '../find-env-file-overrides.ts';

describe(findEnvFileOverrides, () => {
  it('returns nothing when the root has no .env', () => {
    using tree = createTempTree({});

    expect(findEnvFileOverrides(tree.dir, {})).toBeUndefined();
  });

  it('reports the OpenAI variables that the .env sets and the configuration does not declare', () => {
    using tree = createTempTree({ '.env': 'OPENAI_API_KEY=sk-x\nexport OPENAI_BASE_URL=http://x\nOTHER=1\n' });

    expect(findEnvFileOverrides(tree.dir, {})).toStrictEqual({
      envFilePath: tree.resolve('.env'),
      names: ['OPENAI_API_KEY', 'OPENAI_BASE_URL'],
    });
  });

  it('omits a variable that the configuration declares', () => {
    using tree = createTempTree({ '.env': 'OPENAI_API_KEY=sk-x\n' });

    expect(findEnvFileOverrides(tree.dir, { OPENAI_API_KEY: 'declared' })).toBeUndefined();
  });
});
