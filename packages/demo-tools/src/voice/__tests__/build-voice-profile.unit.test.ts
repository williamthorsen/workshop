import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { VoiceConfig } from '../../config/read-machine-config.ts';
import { buildVoiceProfile, resolveVoiceProfilePaths } from '../build-voice-profile.ts';
import type { Invocation, RunInvocation } from '../invocation.ts';

describe(buildVoiceProfile, () => {
  it('converts the reference to mono WAV, keeping its rate, and records the checksums of the sources', async () => {
    using tree = createTempTree({ 'reference.m4a': 'audio', 'reference.txt': '  Hello there.\n\n' });
    const calls: Invocation[] = [];

    const result = await buildVoiceProfile(buildVoice(tree), fakeFfmpeg(calls));

    const paths = resolveVoiceProfilePaths(tree.resolve('home'));
    const record = {
      schemaVersion: 1,
      model: 'org/model',
      referenceSha256: sha256('audio'),
      transcriptSha256: sha256('  Hello there.\n\n'),
    };
    expect(result).toStrictEqual({ ok: true, record });
    expect(calls[0]?.args).toStrictEqual(expect.arrayContaining(['-i', tree.resolve('reference.m4a'), '-ac', '1']));
    expect(calls[0]?.args).not.toContain('-ar');
    expect(readFileSync(paths.referenceAudio, 'utf8')).toBe('wav');
    expect(readFileSync(paths.transcript, 'utf8')).toBe('Hello there.\n');
    expect(JSON.parse(readFileSync(paths.record, 'utf8'))).toStrictEqual(record);
  });

  it('replaces an existing profile', async () => {
    using tree = createTempTree({
      'home/profile/stale.txt': 'stale',
      'reference.m4a': 'audio',
      'reference.txt': 'Hello.',
    });

    await buildVoiceProfile(buildVoice(tree), fakeFfmpeg([]));

    expect(readdirSync(tree.resolve('home/profile')).toSorted()).toStrictEqual([
      'profile.json',
      'reference.wav',
      'transcript.txt',
    ]);
  });

  it('refuses an empty transcript without converting anything', async () => {
    using tree = createTempTree({ 'reference.m4a': 'audio', 'reference.txt': ' \n' });
    const calls: Invocation[] = [];

    const result = await buildVoiceProfile(buildVoice(tree), fakeFfmpeg(calls));

    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('is empty') });
    expect(calls).toStrictEqual([]);
  });

  it('keeps the existing profile and leaves no partial one when the conversion fails', async () => {
    using tree = createTempTree({
      'home/profile/profile.json': '{}',
      'reference.m4a': 'audio',
      'reference.txt': 'Hello.',
    });

    const result = await buildVoiceProfile(buildVoice(tree), () =>
      Promise.resolve({ ok: false, message: 'ffmpeg exited with code 1' }),
    );

    expect(result).toStrictEqual({
      ok: false,
      message: 'cannot convert the reference recording: ffmpeg exited with code 1',
    });
    expect(readdirSync(tree.resolve('home'))).toStrictEqual(['profile']);
    expect(existsSync(tree.resolve('home/profile/profile.json'))).toBe(true);
  });
});

// region | Helpers

/** Returns a voice configuration whose reference files are in `tree` and whose install is `tree/home`. */
function buildVoice(tree: TempTree): VoiceConfig {
  return {
    home: tree.resolve('home'),
    model: 'org/model',
    referenceAudio: tree.resolve('reference.m4a'),
    referenceTranscript: tree.resolve('reference.txt'),
  };
}

/** Returns a runner that records each call and writes `wav` to the target, the last argument. */
function fakeFfmpeg(calls: Invocation[]): RunInvocation {
  return (invocation) => {
    calls.push(invocation);
    writeFileSync(invocation.args.at(-1) ?? '', 'wav');
    return Promise.resolve({ ok: true });
  };
}

/** Returns the sha256 of a string. */
function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

// endregion | Helpers
