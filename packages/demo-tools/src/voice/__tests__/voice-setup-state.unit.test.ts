import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import {
  planSetupSteps,
  readVoiceSetupState,
  type SetupInputs,
  type VoiceSetupState,
  writeVoiceSetupState,
} from '../voice-setup-state.ts';

const SOURCES = { referenceSha256: 'ref', transcriptSha256: 'txt' };

const INPUTS: SetupInputs = {
  hasModelDir: true,
  hasProfile: true,
  hasVenv: true,
  mlxAudio: '0.6.3',
  model: 'org/model',
  profileSources: SOURCES,
};

const DONE: VoiceSetupState = { schemaVersion: 1, mlxAudio: '0.6.3', model: 'org/model', profile: SOURCES };

describe(planSetupSteps, () => {
  it('skips every step when the state shows its inputs unchanged', () => {
    expect(planSetupSteps(DONE, INPUTS)).toStrictEqual({ download: false, install: false, profile: false });
  });

  it('runs every step for a state that shows nothing done', () => {
    expect(planSetupSteps({ schemaVersion: 1 }, INPUTS)).toStrictEqual({
      download: true,
      install: true,
      profile: true,
    });
  });

  it.each([
    ['a new pinned mlx-audio', { mlxAudio: '0.7.0' }],
    ['a missing virtual environment', { hasVenv: false }],
  ])('reinstalls alone for %s', (_label, change) => {
    expect(planSetupSteps(DONE, { ...INPUTS, ...change })).toStrictEqual({
      download: false,
      install: true,
      profile: false,
    });
  });

  it.each([
    ['a new model', { model: 'org/other' }],
    ['a missing model directory', { hasModelDir: false }],
  ])('downloads and rebuilds the profile for %s', (_label, change) => {
    expect(planSetupSteps(DONE, { ...INPUTS, ...change })).toStrictEqual({
      download: true,
      install: false,
      profile: true,
    });
  });

  it.each([
    ['a changed reference recording', { profileSources: { ...SOURCES, referenceSha256: 'new' } }],
    ['a changed transcript', { profileSources: { ...SOURCES, transcriptSha256: 'new' } }],
    ['a missing profile', { hasProfile: false }],
  ])('rebuilds the profile alone for %s', (_label, change) => {
    expect(planSetupSteps(DONE, { ...INPUTS, ...change })).toStrictEqual({
      download: false,
      install: false,
      profile: true,
    });
  });
});

describe(readVoiceSetupState, () => {
  it('reads back what was written', () => {
    using tree = createTempTree({ '.keep': '' });

    writeVoiceSetupState(tree.resolve('voice/state.json'), DONE);

    expect(readVoiceSetupState(tree.resolve('voice/state.json'))).toStrictEqual(DONE);
  });

  it.each([
    ['a missing file', undefined],
    ['unparseable JSON', '{'],
    ['another schema version', '{"schemaVersion":2,"mlxAudio":"0.6.3"}'],
    ['fields of the wrong type', '{"schemaVersion":1,"mlxAudio":6,"profile":{"referenceSha256":1}}'],
  ])('treats %s as showing nothing done', (_label, content) => {
    using tree = createTempTree(content === undefined ? { '.keep': '' } : { 'state.json': content });

    expect(readVoiceSetupState(tree.resolve('state.json'))).toStrictEqual({ schemaVersion: 1 });
  });
});
