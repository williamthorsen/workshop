import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { OPENAI_VARIABLES } from '../build-aidemo-env.ts';
import { findEnvFileOverrides } from '../find-env-file-overrides.ts';

describe(findEnvFileOverrides, () => {
  it('returns nothing when the root has no .env', () => {
    using tree = createTempTree({});

    expect(findEnvFileOverrides(tree.dir, {}, OPENAI_VARIABLES)).toBeUndefined();
  });

  it('reports the OpenAI variables that the .env sets and the configuration does not declare', () => {
    using tree = createTempTree({ '.env': 'OPENAI_API_KEY=sk-x\nexport OPENAI_BASE_URL=http://x\nOTHER=1\n' });

    expect(findEnvFileOverrides(tree.dir, {}, OPENAI_VARIABLES)).toStrictEqual({
      envFilePath: tree.resolve('.env'),
      names: ['OPENAI_API_KEY', 'OPENAI_BASE_URL'],
    });
  });

  it('omits a variable that the configuration declares', () => {
    using tree = createTempTree({ '.env': 'OPENAI_API_KEY=sk-x\n' });

    expect(findEnvFileOverrides(tree.dir, { OPENAI_API_KEY: 'declared' }, OPENAI_VARIABLES)).toBeUndefined();
  });

  it('checks only the names that the caller passes', () => {
    using tree = createTempTree({ '.env': 'OPENAI_API_KEY=sk-x\nAIDEMO_TTS_PROVIDER=elevenlabs\n' });

    expect(findEnvFileOverrides(tree.dir, {}, ['AIDEMO_TTS_PROVIDER', 'AIDEMO_TTS_MODEL'])).toStrictEqual({
      envFilePath: tree.resolve('.env'),
      names: ['AIDEMO_TTS_PROVIDER'],
    });
  });
});
