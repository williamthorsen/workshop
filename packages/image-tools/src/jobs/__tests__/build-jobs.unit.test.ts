import { describe, expect, it } from 'vitest';

import type { Style } from '../../catalogue/read-catalogue.ts';
import { MODELS } from '../../models/models.ts';
import { buildJobs, type GenerateRequest } from '../build-jobs.ts';

const [QWEN, Z_IMAGE] = MODELS;

const STYLES: readonly Style[] = [
  { name: 'oil', negativePrompt: 'photograph', prompt: 'an oil painting of {prompt}' },
  { name: 'engraving', negativePrompt: undefined, prompt: 'an engraving of {prompt}' },
  { name: 'noir', negativePrompt: undefined, prompt: 'a noir panel of {prompt}' },
];

const REQUEST: GenerateRequest = {
  model: requireModel(QWEN),
  references: [],
  runDir: '/runs/20261124-120000Z',
  seeds: [7],
  size: undefined,
  styleNames: ['oil'],
  subject: 'a lighthouse',
};

describe(buildJobs, () => {
  it('builds one text-to-image job per style and seed, style-major, at the default size', () => {
    const result = build({ seeds: [1, 2], styleNames: ['noir', 'oil'] });

    expect(result).toStrictEqual({
      ok: true,
      request: {
        jobs: [
          job('noir', 1, 'a noir panel of a lighthouse', null),
          job('noir', 2, 'a noir panel of a lighthouse', null),
          job('oil', 1, 'an oil painting of a lighthouse', 'photograph'),
          job('oil', 2, 'an oil painting of a lighthouse', 'photograph'),
        ],
        model: 'qwen-image-2.1-turbo',
        references: [],
        variant: 'txt2img',
      },
    });
  });

  it('selects every style in catalogue order for all', () => {
    const result = build({ styleNames: ['all'] });

    expect(result.ok && result.request.jobs.map(({ style }) => style)).toStrictEqual(['oil', 'engraving', 'noir']);
  });

  it('renders a repeated style or seed once', () => {
    const result = build({ seeds: [3, 3], styleNames: ['oil', 'oil'] });

    expect(result.ok && result.request.jobs.map(({ output }) => output)).toStrictEqual([
      '/runs/20261124-120000Z/oil-3.png',
    ]);
  });

  it('routes references to the edit variant and leaves the size to it when --size is absent', () => {
    const result = build({ references: ['/in/a.png', '/in/b.png'] });

    expect(result.ok && result.request).toMatchObject({
      jobs: [{ height: null, width: null }],
      references: ['/in/a.png', '/in/b.png'],
      variant: 'edit',
    });
  });

  it('passes an explicit size to the edit variant', () => {
    const result = build({ references: ['/in/a.png'], size: { height: 768, width: 1024 } });

    expect(result.ok && result.request.jobs[0]).toMatchObject({ height: 768, width: 1024 });
  });

  it.each([
    {
      label: 'an empty subject',
      overrides: { subject: '  ' },
      problem: 'the subject is empty; describe what to render',
    },
    {
      label: 'no style',
      overrides: { styleNames: [] },
      problem: '--style is required; name one or more styles, or all',
    },
    {
      label: 'all with a style name',
      overrides: { styleNames: ['all', 'oil'] },
      problem: '--style all selects every style and cannot be combined with a style name',
    },
    {
      label: 'an unknown style',
      overrides: { styleNames: ['oyl'] },
      problem: '--style accepts oil, engraving, noir, or all, not oyl',
    },
    {
      label: 'references with a model that lacks an edit variant',
      overrides: { model: requireModel(Z_IMAGE), references: ['/in/a.png'] },
      problem: 'z-image-turbo has no edit variant, so it takes no --reference; use --model qwen-image-2.1-turbo',
    },
    {
      label: 'more references than the edit variant takes',
      overrides: { references: Array.from({ length: 11 }, (_, index) => `/in/${index}.png`) },
      problem: 'qwen-image-2.1-turbo takes at most 10 references, not 11',
    },
    {
      label: 'a reference that does not exist',
      overrides: { references: ['/in/a.png', '/in/absent.png'] },
      problem: '--reference /in/absent.png: file not found',
    },
  ])('rejects $label', ({ overrides, problem }) => {
    const result = build(overrides);

    expect(result.ok ? undefined : result.problem).toBe(problem);
  });

  it('suggests the nearest style for a misspelt one', () => {
    const result = build({ styleNames: ['oyl'] });

    expect(result.ok ? undefined : result.suggestion).toBe('oil');
  });
});

// region | Helpers

/** Builds jobs for `REQUEST` with `overrides`, treating every reference but one named `absent` as present. */
function build(overrides: Partial<GenerateRequest>): ReturnType<typeof buildJobs> {
  return buildJobs({ ...REQUEST, ...overrides }, STYLES, (filePath) => !filePath.includes('absent'));
}

/** Returns the default-size text-to-image job that `REQUEST` produces for one style and seed. */
function job(style: string, seed: number, prompt: string, negativePrompt: string | null): object {
  return {
    height: 1024,
    negativePrompt,
    output: `/runs/20261124-120000Z/${style}-${seed}.png`,
    prompt,
    seed,
    style,
    width: 1024,
  };
}

/** Narrows a model taken from the registry by position. */
function requireModel(model: (typeof MODELS)[number] | undefined): (typeof MODELS)[number] {
  if (model === undefined) throw new Error('The registry lacks the model under test.');
  return model;
}

// endregion | Helpers
