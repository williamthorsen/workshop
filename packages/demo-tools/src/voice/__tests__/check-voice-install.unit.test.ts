import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { VoiceConfig } from '../../config/read-machine-config.ts';
import { readProfileSources } from '../build-voice-profile.ts';
import { checkVoiceInstall } from '../check-voice-install.ts';
import { formatModelDir } from '../mlx-audio/format-model-dir.ts';

const MODEL = 'mlx-community/model';

describe(checkVoiceInstall, () => {
  it('returns the reference recording checksum of a matching install', () => {
    using tree = createInstall();
    const voice = buildVoice(tree);

    expect(checkVoiceInstall(voice)).toStrictEqual({
      ok: true,
      referenceSha256: readProfileSources(voice).referenceSha256,
    });
  });

  it.each([
    ['mlx-audio', 'voice/venv/bin/python', /mlx-audio is not installed in/],
    ['the model', `voice/models/${MODEL.replace('/', '--')}`, /mlx-community\/model is not downloaded/],
    ['the profile', 'voice/profile/profile.json', /the voice profile is missing or unreadable/],
  ])('reports missing %s, naming voice setup', (_label, entry, expected) => {
    using tree = createInstall();
    rmSync(tree.resolve(entry), { force: true, recursive: true });

    const result = checkVoiceInstall(buildVoice(tree));

    expect(result.ok ? '' : result.problem).toMatch(expected);
    expect(result.ok ? '' : result.problem).toMatch(/; run thor-demo voice setup$/);
  });

  it('reports a profile built for another model', () => {
    using tree = createInstall();

    const result = checkVoiceInstall({ ...buildVoice(tree), model: 'other/model' });

    expect(result.ok ? '' : result.problem).toMatch(/^other\/model is not downloaded/);
  });

  it('reports a profile whose record names another model than the configured one', () => {
    using tree = createInstall({ recordModel: 'other/model' });

    const result = checkVoiceInstall(buildVoice(tree));

    expect(result.ok ? '' : result.problem).toContain('built for other/model, but voice.model is mlx-community/model');
  });

  it.each([
    ['recording', 'reference.m4a', 'voice.reference.audio names'],
    ['transcript', 'reference.txt', 'voice.reference.transcript names'],
  ])('reports a reference %s that no longer exists, naming it', (_label, entry, expected) => {
    using tree = createInstall();
    rmSync(tree.resolve(entry));

    const result = checkVoiceInstall(buildVoice(tree));

    expect(result.ok ? '' : result.problem).toContain(`${expected} ${tree.resolve(entry)}, which does not exist`);
  });

  it('reports a changed transcript', () => {
    using tree = createInstall();
    writeFileSync(tree.resolve('reference.txt'), 'Something else.');

    const result = checkVoiceInstall(buildVoice(tree));

    expect(result.ok ? '' : result.problem).toContain('from another transcript than voice.reference.transcript');
  });
});

// region | Helpers

/** Returns the voice configuration of an install in `tree`. */
function buildVoice(tree: TempTree): VoiceConfig {
  return {
    home: tree.resolve('voice'),
    model: MODEL,
    referenceAudio: tree.resolve('reference.m4a'),
    referenceTranscript: tree.resolve('reference.txt'),
  };
}

/** Builds a complete install of `MODEL` whose profile record names `recordModel`. */
function createInstall({ recordModel = MODEL }: { recordModel?: string } = {}): TempTree {
  const tree = createTempTree({ 'reference.m4a': 'audio', 'reference.txt': 'Hello.', 'voice/venv/bin/python': '' });
  const voice = buildVoice(tree);
  tree.write(path.join(path.relative(tree.dir, formatModelDir(voice.home, MODEL)), 'config.json'), '{}');
  tree.write(
    'voice/profile/profile.json',
    JSON.stringify({ schemaVersion: 1, model: recordModel, ...readProfileSources(voice) }),
  );
  return tree;
}

// endregion | Helpers
