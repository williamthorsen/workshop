import { describe, expect, it } from 'vitest';

import { fillTemplate } from '../fill-template.ts';

describe(fillTemplate, () => {
  it('puts the trimmed subject in the prompt', () => {
    const style = { name: 'oil', negativePrompt: undefined, prompt: 'an oil painting of {prompt}, chiaroscuro' };

    expect(fillTemplate(style, '  a lighthouse ')).toStrictEqual({
      negativePrompt: undefined,
      prompt: 'an oil painting of a lighthouse, chiaroscuro',
    });
  });

  it('inserts a subject that contains a replacement pattern literally', () => {
    const style = { name: 'oil', negativePrompt: undefined, prompt: 'a painting of {prompt}' };

    expect(fillTemplate(style, 'a $& sign').prompt).toBe('a painting of a $& sign');
  });

  it('fills a negative prompt that contains the placeholder and keeps one that does not', () => {
    const withPlaceholder = { name: 'a', negativePrompt: 'no {prompt} twins', prompt: '{prompt}' };
    const without = { name: 'b', negativePrompt: 'photograph', prompt: '{prompt}' };

    expect(fillTemplate(withPlaceholder, 'cat').negativePrompt).toBe('no cat twins');
    expect(fillTemplate(without, 'cat').negativePrompt).toBe('photograph');
  });
});
