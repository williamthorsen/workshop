import { describe, expect, it } from 'vitest';

import { parseKitSpecifiers } from '../src/parseKitSpecifiers.ts';

describe(parseKitSpecifiers, () => {
  it('parses a single kit name without checklists', () => {
    expect(parseKitSpecifiers(['deploy'])).toStrictEqual([{ kitName: 'deploy', checklists: [] }]);
  });

  it('parses a kit name with comma-separated checklists', () => {
    expect(parseKitSpecifiers(['deploy:check1,check2'])).toStrictEqual([
      { kitName: 'deploy', checklists: ['check1', 'check2'] },
    ]);
  });

  it('parses multiple positional args into separate entries', () => {
    expect(parseKitSpecifiers(['deploy:check1', 'infra'])).toStrictEqual([
      { kitName: 'deploy', checklists: ['check1'] },
      { kitName: 'infra', checklists: [] },
    ]);
  });

  it('supports kit names with slashes', () => {
    expect(parseKitSpecifiers(['shared/deploy:check1'])).toStrictEqual([
      { kitName: 'shared/deploy', checklists: ['check1'] },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseKitSpecifiers([])).toStrictEqual([]);
  });

  it('throws for an empty kit name before the colon', () => {
    expect(() => parseKitSpecifiers([':check1'])).toThrow('kit name must not be empty');
  });

  it('throws for a trailing colon with no checklists', () => {
    expect(() => parseKitSpecifiers(['deploy:'])).toThrow('checklist list after ":" must not be empty');
  });

  it('parses a single checklist after the colon', () => {
    expect(parseKitSpecifiers(['deploy:check1'])).toStrictEqual([{ kitName: 'deploy', checklists: ['check1'] }]);
  });

  it('splits on only the first colon', () => {
    expect(parseKitSpecifiers(['deploy:ns:check1'])).toStrictEqual([{ kitName: 'deploy', checklists: ['ns:check1'] }]);
  });
});
