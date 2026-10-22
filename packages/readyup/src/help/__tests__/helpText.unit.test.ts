import { measureWidth } from '@williamthorsen/toolbelt.terminal/candidate';
import { describe, expect, it } from 'vitest';

import { COMMAND_HELP, HELP_WIDTH } from '../helpText.ts';

describe('COMMAND_HELP', () => {
  it.each(Object.entries(COMMAND_HELP))('fits every line of the %s help within the help width', (_name, text) => {
    const overlong = text.split('\n').filter((line) => measureWidth(line) > HELP_WIDTH);

    expect(overlong).toStrictEqual([]);
  });

  it.each(Object.entries(COMMAND_HELP).filter(([, text]) => text.includes('--style')))(
    'pairs each --style value with its meaning in the %s help',
    (_name, text) => {
      const flowed = text.replaceAll(/\s+/g, ' ');

      expect(flowed).toContain('auto (detected)');
      expect(flowed).toContain('plain (ASCII words)');
      expect(flowed).toContain('rich (emoji and colour)');
    },
  );
});
