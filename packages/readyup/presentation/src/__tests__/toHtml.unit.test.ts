import ansiStyles from 'ansi-styles';
import { describe, expect, it } from 'vitest';

import { richColorFormatter } from '../../../src/layout/formatter.ts';
import { toHtml } from '../toHtml.ts';

describe(toHtml, () => {
  it('escapes ampersands and angle brackets', () => {
    expect(toHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it.each([
    ['errors', 'sgr-bold sgr-red'],
    ['blocked', 'sgr-bold sgr-red'],
    ['warnings', 'sgr-bold sgr-yellow'],
    ['passed', 'sgr-bold sgr-green'],
    ['optional', 'sgr-bold sgr-gray'],
    ['recommendations', 'sgr-bold sgr-gray'],
  ] as const)('maps the %s tally to %s', (key, classes) => {
    expect(toHtml(`Total: ${richColorFormatter.paint.tally(key, '1 x')}`)).toBe(
      `Total: <span class="${classes}">1 x</span>`,
    );
  });

  it('maps a dimmed rule to its class', () => {
    expect(toHtml(richColorFormatter.paint.rule('──'))).toBe('<span class="sgr-dim">──</span>');
  });

  it('closes every span that it opens, across a reset and across sequences left open', () => {
    const html = toHtml(`${ansiStyles.red.open}a${ansiStyles.reset.open}b${ansiStyles.bold.open}c`);

    expect(html).toBe('<span class="sgr-red">a</span>b<span class="sgr-bold">c</span>');
    expect(html.match(/<span/gu)?.length).toBe(html.match(/<\/span>/gu)?.length);
  });

  it('ignores a parameter that rich output does not emit', () => {
    expect(toHtml(`${ansiStyles.underline.open}a${ansiStyles.underline.close}`)).toBe('a');
  });
});
