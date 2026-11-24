import { describe, expect, it } from 'vitest';

import type { WorkerRequest } from '../../jobs/build-jobs.ts';
import { MODELS } from '../../models/models.ts';
import { buildRunRecord } from '../build-run-record.ts';

const [MODEL] = MODELS;

const REQUEST: WorkerRequest = {
  jobs: [
    {
      height: null,
      negativePrompt: null,
      output: '/run/oil-1.png',
      prompt: 'oil of a fox',
      seed: 1,
      style: 'oil',
      width: null,
    },
    {
      height: null,
      negativePrompt: 'photo',
      output: '/run/noir-1.png',
      prompt: 'noir of a fox',
      seed: 1,
      style: 'noir',
      width: null,
    },
  ],
  model: 'qwen-image-2.1-turbo',
  references: ['/in/scene.png'],
  variant: 'edit',
};

describe(buildRunRecord, () => {
  it('records a dry run with the size and steps left to the model', () => {
    const record = build({ failure: undefined, mfluxVersion: '0.24.0', rendered: undefined });

    expect(record).toMatchObject({
      dryRun: true,
      failure: null,
      images: [{ file: 'oil-1.png' }, { file: 'noir-1.png' }],
    });
    expect(record.images[0]?.settings).toStrictEqual({
      height: null,
      references: ['/in/scene.png'],
      steps: null,
      variant: 'edit',
      width: null,
    });
  });

  it('records the size and steps that the worker reported, and the job that failed', () => {
    const record = build({
      failure: { index: 1, message: 'image 2 failed: out of memory' },
      mfluxVersion: '0.24.1',
      rendered: [{ event: 'rendered', height: 768, index: 0, steps: 8, width: 1152 }],
    });

    expect(record).toMatchObject({
      dryRun: false,
      failure: { message: 'image 2 failed: out of memory', seed: 1, style: 'noir' },
      images: [{ mfluxVersion: '0.24.1', settings: { height: 768, steps: 8, width: 1152 }, style: 'oil' }],
    });
    expect(record.images).toHaveLength(1);
  });
});

// region | Helpers

/** Builds the record of `REQUEST` with the given outcome. */
function build(outcome: Parameters<typeof buildRunRecord>[0]['outcome']): ReturnType<typeof buildRunRecord> {
  if (MODEL === undefined) throw new Error('The registry lacks a model.');
  return buildRunRecord({
    createdAt: new Date('2026-11-24T12:00:00Z'),
    model: MODEL,
    outcome,
    request: REQUEST,
    runDir: '/run',
    subject: 'a fox',
  });
}

// endregion | Helpers
