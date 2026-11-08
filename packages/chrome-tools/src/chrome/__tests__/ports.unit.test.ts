import { describe, expect, it } from 'vitest';

import { derivePort, HASH_PORT_RANGE } from '../ports.ts';

describe(derivePort, () => {
  it.each([
    ['a bare ticket number', '701', 20_701],
    ['a ticket number of ten thousand or more, wrapped into the range', '12345', 22_345],
    ['a revisit, which shares its base ticket', '701.2', 20_701],
    ['an uppercase-keyed ref', 'MAC-42', 20_042],
    ['a ticket in a later segment', 'feature/701-ports', 20_701],
  ])('reads the ticket of %s', (_description, branch, port) => {
    expect(derivePort(branch, 'widget')).toBe(port);
  });

  it('gives a ticket the same port in every repository', () => {
    expect(derivePort('701', 'workshop')).toBe(derivePort('701', 'soulforge'));
  });

  // The values pin the hash, so that a change to its algorithm, which would move every non-ticket port, fails here
  it.each([
    ['workshop', 'main', 34_185],
    ['soulforge', 'main', 39_001],
    [undefined, 'main', 36_764],
  ])('hashes repository %s and branch %s', (repo, branch, port) => {
    expect(derivePort(branch, repo)).toBe(port);
  });

  it('hashes a branch that encodes no ticket within the hash range', () => {
    const port = derivePort('mac-42', 'widget');
    expect(port).toBeGreaterThanOrEqual(HASH_PORT_RANGE.min);
    expect(port).toBeLessThanOrEqual(HASH_PORT_RANGE.max);
  });

  it('does not read a digit-led repository name as a ticket', () => {
    expect(derivePort('main', '701-widgets')).toBe(36_972);
    expect(derivePort('42', '701-widgets')).toBe(20_042);
  });
});
