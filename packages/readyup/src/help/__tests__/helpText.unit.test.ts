import { measureWidth } from '@williamthorsen/toolbelt.terminal/candidate';
import { describe, expect, it } from 'vitest';

import { COMMAND_HELP, HELP_WIDTH } from '../helpText.ts';

describe('COMMAND_HELP', () => {
  it.each(Object.entries(COMMAND_HELP))('fits every line of the %s help within the help width', (_name, text) => {
    const overlong = text.split('\n').filter((line) => measureWidth(line) > HELP_WIDTH);

    expect(overlong).toStrictEqual([]);
  });
});
