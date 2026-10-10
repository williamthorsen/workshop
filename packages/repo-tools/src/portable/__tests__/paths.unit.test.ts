import { describe, expect, it } from 'vitest';

import { expandTilde, formatDisplayPath, readHome } from '../paths.ts';

describe(expandTilde, () => {
  it.each([
    ['~', '/home/ada'],
    ['~/repos/alpha', '/home/ada/repos/alpha'],
    ['/srv/alpha', '/srv/alpha'],
    ['~ada/alpha', '~ada/alpha'],
  ])('expands %s to %s', (value, expected) => {
    expect(expandTilde(value, '/home/ada')).toBe(expected);
  });
});

describe(formatDisplayPath, () => {
  it.each([
    ['/home/ada', '~'],
    ['/home/ada/repos/alpha', '~/repos/alpha'],
    ['/home/adam/alpha', '/home/adam/alpha'],
  ])('abbreviates %s to %s', (value, expected) => {
    expect(formatDisplayPath(value, '/home/ada')).toBe(expected);
  });

  it('leaves every path unchanged when the home directory is unknown', () => {
    expect(formatDisplayPath('/home/ada/alpha', '')).toBe('/home/ada/alpha');
  });
});

describe(readHome, () => {
  it('strips trailing slashes', () => {
    expect(readHome({ HOME: '/home/ada//' })).toBe('/home/ada');
  });

  it('returns an empty string when HOME is unset', () => {
    expect(readHome({})).toBe('');
  });
});
