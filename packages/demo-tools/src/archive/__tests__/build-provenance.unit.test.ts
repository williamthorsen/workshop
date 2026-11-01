import { describe, expect, it } from 'vitest';

import { buildProvenance, type ProvenanceInput } from '../build-provenance.ts';

const INPUT: ProvenanceInput = {
  aidemoVersion: '0.20.0',
  demo: 'quickstart',
  files: {
    'report.json': { bytes: 2, sha256: 'r' },
    'final-demo.mp4': { bytes: 10, sha256: 'v' },
  },
  label: 'product-demos',
  params: ['--tts', 'local'],
  renderedAt: new Date('2026-11-01T03:04:05.678Z'),
  source: { commit: 'abc1234def', dirty: true },
  storyboardSha256: 's',
  voice: { provider: 'local', voiceId: 'af_heart' },
};

describe(buildProvenance, () => {
  it('builds the schema 1 record, with the files ordered by name', () => {
    const provenance = buildProvenance(INPUT);

    expect(provenance).toStrictEqual({
      schemaVersion: 1,
      demo: 'quickstart',
      label: 'product-demos',
      renderedAt: '2026-11-01T03:04:05.678Z',
      source: { commit: 'abc1234def', dirty: true },
      engine: { package: '@tandryukha/aidemo', version: '0.20.0' },
      voice: { provider: 'local', voiceId: 'af_heart' },
      params: ['--tts', 'local'],
      storyboard: { sha256: 's' },
      files: {
        'final-demo.mp4': { bytes: 10, sha256: 'v' },
        'report.json': { bytes: 2, sha256: 'r' },
      },
    });
    expect(Object.keys(provenance.files)).toStrictEqual(['final-demo.mp4', 'report.json']);
  });

  it('records the reference recording of a cloned voice after the voice', () => {
    const provenance = buildProvenance({
      ...INPUT,
      reference: { sha256: 'ref' },
      voice: { provider: 'mlx-audio', voiceId: 'mlx-community/model' },
    });

    expect(provenance.reference).toStrictEqual({ sha256: 'ref' });
    expect(Object.keys(provenance).indexOf('reference')).toBe(Object.keys(provenance).indexOf('voice') + 1);
  });

  it('omits the reference for a voice that is not cloned', () => {
    expect(Object.hasOwn(buildProvenance(INPUT), 'reference')).toBe(false);
  });

  it('records an unknown source state as nulls', () => {
    expect(buildProvenance({ ...INPUT, source: undefined }).source).toStrictEqual({ commit: null, dirty: null });
  });
});
