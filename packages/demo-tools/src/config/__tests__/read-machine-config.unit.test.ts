import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VOICE_HOME,
  DEFAULT_VOICE_MODEL,
  MACHINE_CONFIG_PATH,
  type MachineConfigResult,
  readMachineConfig,
} from '../read-machine-config.ts';

const REFERENCE_FILES = { 'voice/reference.m4a': 'audio', 'voice/reference.txt': 'Hello.' };
const REFERENCE = '  reference:\n    audio: ~/voice/reference.m4a\n    transcript: ~/voice/reference.txt\n';

describe(readMachineConfig, () => {
  it('sets nothing when the file is missing', () => {
    using home = createTempTree({ '.keep': '' });

    expect(readMachineConfig({ env: {}, homeDir: home.dir })).toStrictEqual({
      ok: true,
      archive: { ok: true, root: undefined },
      voice: { ok: true, voice: undefined },
    });
  });

  it.each([
    ['an empty file', ''],
    ['empty sections', 'archive:\nvoice:\n'],
  ])('sets nothing for %s', (_label, content) => {
    using home = createTempTree({ [MACHINE_CONFIG_PATH]: content });

    const result = readMachineConfig({ env: {}, homeDir: home.dir });

    expect(result).toStrictEqual({
      ok: true,
      archive: { ok: true, root: undefined },
      voice: { ok: true, voice: undefined },
    });
  });

  it('applies the defaults for voice.home and voice.model, expanding the reference paths', () => {
    using home = createTempTree({ [MACHINE_CONFIG_PATH]: `voice:\n${REFERENCE}`, ...REFERENCE_FILES });

    expect(readVoice(readMachineConfig({ env: {}, homeDir: home.dir }))).toStrictEqual({
      ok: true,
      voice: {
        home: home.resolve(DEFAULT_VOICE_HOME),
        model: DEFAULT_VOICE_MODEL,
        referenceAudio: home.resolve('voice/reference.m4a'),
        referenceTranscript: home.resolve('voice/reference.txt'),
      },
    });
  });

  it('reads voice.home and voice.model, expanding ${VAR} in the home', () => {
    using home = createTempTree({
      [MACHINE_CONFIG_PATH]: `voice:\n  home: \${DATA}/voice\n  model: org/model\n${REFERENCE}`,
      ...REFERENCE_FILES,
    });

    const voice = readVoice(readMachineConfig({ env: { DATA: '/data' }, homeDir: home.dir }));

    expect(voice).toMatchObject({ ok: true, voice: { home: '/data/voice', model: 'org/model' } });
  });

  it('keeps a malformed voice section from failing the archive section', () => {
    using home = createTempTree({ [MACHINE_CONFIG_PATH]: 'archive:\n  root: /takes\nvoice:\n  nope: 1\n' });

    const result = readMachineConfig({ env: {}, homeDir: home.dir });

    expect(result).toMatchObject({ ok: true, archive: { ok: true, root: '/takes' }, voice: { ok: false } });
  });

  it('keeps a malformed archive section from failing the voice section', () => {
    using home = createTempTree({ [MACHINE_CONFIG_PATH]: 'archive: /takes\nvoice:\n' });

    const result = readMachineConfig({ env: {}, homeDir: home.dir });

    expect(result).toMatchObject({ ok: true, archive: { ok: false }, voice: { ok: true, voice: undefined } });
  });

  it.each([
    ['malformed YAML', 'voice: [\n', /cannot be read as YAML/],
    ['a document that is not a mapping', '- a\n', /must be a mapping/],
    ['an unknown top-level key', 'voices:\n', /unknown key "voices"; the keys are archive and voice/],
  ])('reports %s as a failure of the whole file, naming it', (_label, content, expected) => {
    using home = createTempTree({ [MACHINE_CONFIG_PATH]: content });

    const result = readMachineConfig({ env: {}, homeDir: home.dir });

    expect(result.ok).toBe(false);
    const message = result.ok ? '' : result.message;
    expect(message).toMatch(expected);
    expect(message.startsWith(home.resolve(MACHINE_CONFIG_PATH))).toBe(true);
  });

  it.each([
    ['a non-mapping voice section', 'voice: x\n', /voice must be a mapping/],
    ['an unknown voice key', 'voice:\n  x: 1\n', /unknown key "voice\.x"; the keys are home, model, and reference/],
    ['a non-string home', `voice:\n  home: 9\n${REFERENCE}`, /voice\.home must be a non-empty string/],
    ['a relative home', `voice:\n  home: voice\n${REFERENCE}`, /voice\.home must be an absolute path, not "voice"/],
    ['an unset variable in the home', `voice:\n  home: \${UNSET}\n${REFERENCE}`, /voice\.home: UNSET is not set/],
    ['an empty model', `voice:\n  model: ''\n${REFERENCE}`, /voice\.model must be a non-empty string/],
    ['a non-string model', `voice:\n  model: 3\n${REFERENCE}`, /voice\.model must be a non-empty string/],
    [
      'a missing reference',
      'voice:\n  model: org/model\n',
      /voice\.reference is required; set voice\.reference\.audio/,
    ],
    ['a non-mapping reference', 'voice:\n  reference: x\n', /voice\.reference must be a mapping/],
    [
      'an unknown reference key',
      'voice:\n  reference:\n    video: x\n',
      /unknown key "voice\.reference\.video"; the keys are audio and transcript/,
    ],
    [
      'a missing reference audio',
      'voice:\n  reference:\n    transcript: ~/voice/reference.txt\n',
      /voice\.reference\.audio is required/,
    ],
    [
      'a missing reference transcript',
      'voice:\n  reference:\n    audio: ~/voice/reference.m4a\n',
      /voice\.reference\.transcript is required/,
    ],
    [
      'a relative reference audio',
      'voice:\n  reference:\n    audio: reference.m4a\n',
      /voice\.reference\.audio must be an absolute path, not "reference\.m4a"/,
    ],
    [
      'a reference audio that does not exist',
      'voice:\n  reference:\n    audio: /nowhere/reference.m4a\n',
      /voice\.reference\.audio must name a file, but \/nowhere\/reference\.m4a is not one/,
    ],
    [
      'a reference transcript that is a directory',
      'voice:\n  reference:\n    audio: ~/voice/reference.m4a\n    transcript: ~/voice\n',
      /voice\.reference\.transcript must name a file, but .*\/voice is not one/,
    ],
  ])('reports %s in the voice section, naming the file', (_label, content, expected) => {
    using home = createTempTree({ [MACHINE_CONFIG_PATH]: content, ...REFERENCE_FILES });

    const voice = readVoice(readMachineConfig({ env: {}, homeDir: home.dir }));

    const message = voice.ok ? '' : voice.message;
    expect(message).toMatch(expected);
    expect(message.startsWith(home.resolve(MACHINE_CONFIG_PATH))).toBe(true);
  });
});

// region | Helpers

/** Returns the voice section's result, failing the test when the file as a whole failed. */
function readVoice(result: MachineConfigResult) {
  if (!result.ok) throw new Error(`expected the file to be readable: ${result.message}`);
  return result.voice;
}

// endregion | Helpers
