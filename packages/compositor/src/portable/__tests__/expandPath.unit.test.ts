import { homedir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandPath } from '../expandPath.ts';

describe(expandPath, () => {
  it('resolves a relative location against the base directory, not the working directory', () => {
    expect(expandPath('./content', '/srv/tier')).toBe(path.join('/srv/tier', 'content'));
  });

  it('resolves a relative location that climbs out of the base directory', () => {
    expect(expandPath('../shared', '/srv/tier')).toBe(path.join('/srv', 'shared'));
  });

  it('leaves an absolute location unchanged, so the base directory cannot move it', () => {
    expect(expandPath('/srv/elsewhere', '/srv/tier')).toBe('/srv/elsewhere');
  });

  it('expands a home-relative location', () => {
    expect(expandPath('~/guidance', '/srv/tier')).toBe(path.join(homedir(), 'guidance'));
  });

  it('expands a bare tilde to the home directory itself', () => {
    expect(expandPath('~', '/srv/tier')).toBe(homedir());
  });

  it('resolves a ~user location as relative, since only the current user’s home is expanded', () => {
    expect(expandPath('~other/guidance', '/srv/tier')).toBe(path.join('/srv/tier', '~other/guidance'));
  });
});
