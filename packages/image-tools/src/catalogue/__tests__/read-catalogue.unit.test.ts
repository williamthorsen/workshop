import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { CATALOGUE_PATH, readCatalogue } from '../read-catalogue.ts';

describe(readCatalogue, () => {
  it('reads the shipped catalogue as the ten seed styles, in order', () => {
    const result = readCatalogue(CATALOGUE_PATH);

    expect(result.ok && result.styles.map(({ name }) => name)).toStrictEqual([
      'oil',
      'engraving',
      'manuscript',
      'photoreal',
      'claymation',
      'animated-3d',
      'watercolor',
      'linocut',
      'noir',
      'rubberhose',
    ]);
  });

  it('reads a style without a negative prompt', () => {
    const result = readText('- name: plain\n  prompt: a {prompt}\n');

    expect(result).toStrictEqual({
      ok: true,
      styles: [{ name: 'plain', negativePrompt: undefined, prompt: 'a {prompt}' }],
    });
  });

  it.each([
    { label: 'a document that is not a list', text: 'name: oil\n', problem: 'the catalogue must be a list of styles' },
    { label: 'an entry that is not a mapping', text: '- oil\n', problem: 'entry 1: a style must be a mapping' },
    { label: 'a name that is not kebab-case', text: '- name: Oil Paint\n  prompt: {prompt}\n', problem: 'kebab-case' },
    { label: 'the reserved name', text: '- name: all\n  prompt: "{prompt}"\n', problem: 'all is reserved' },
    { label: 'a prompt without the placeholder', text: '- name: oil\n  prompt: oil\n', problem: 'exactly once' },
    {
      label: 'a prompt with the placeholder twice',
      text: '- name: oil\n  prompt: "{prompt} and {prompt}"\n',
      problem: 'exactly once',
    },
    {
      label: 'a negative prompt that is not a string',
      text: '- name: oil\n  prompt: "{prompt}"\n  negative_prompt: [a]\n',
      problem: 'negative_prompt must be a string',
    },
    { label: 'an unknown key', text: '- name: oil\n  prompt: "{prompt}"\n  steps: 4\n', problem: 'unknown key steps' },
    {
      label: 'a duplicate name',
      text: '- name: oil\n  prompt: "{prompt}"\n- name: oil\n  prompt: "an {prompt}"\n',
      problem: 'entry 2: the name oil is already taken',
    },
    { label: 'unparseable YAML', text: '- name: [oil\n', problem: 'styles.yaml: ' },
  ])('reports $label', ({ problem, text }) => {
    const result = readText(text);

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.problems.join('\n')).toContain(problem);
  });

  it('reports a missing file by its path', () => {
    using tree = createTempTree({});

    const result = readCatalogue(tree.resolve('absent.yaml'));

    expect(result.ok ? '' : result.problems.join('\n')).toContain('absent.yaml');
  });
});

// region | Helpers

/** Reads a catalogue written with `text`. */
function readText(text: string): ReturnType<typeof readCatalogue> {
  using tree = createTempTree({ 'styles.yaml': text });
  return readCatalogue(tree.resolve('styles.yaml'));
}

// endregion | Helpers
