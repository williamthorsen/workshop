import { describe, expect, it } from 'vitest';

import { formatEmptySelection, listUnrunSourceWarnings } from '../source-report.ts';

describe(listUnrunSourceWarnings, () => {
  it('names the requested kit that the source lacks and the kit that it publishes', () => {
    const warnings = listUnrunSourceWarnings([
      { spelling: 'github:acme/standards', requestedNames: ['default'], publishedNames: ['demo'] },
    ]);

    expect(warnings).toStrictEqual([
      {
        code: 'source-not-run',
        message:
          'configured source "github:acme/standards" publishes no kit named "default", so the run ran none of its kits.',
        remedy: 'Run its kits by name with `rdy run --sources demo`, or every kit with `rdy run --sources --all`.',
      },
    ]);
  });

  it('names every requested kit, and lists the source kits beyond the first', () => {
    const [warning] = listUnrunSourceWarnings([
      { spelling: 'npm:@acme/kits', requestedNames: ['preflight', 'default'], publishedNames: ['drift', 'audit'] },
    ]);

    expect(warning?.message).toBe(
      'configured source "npm:@acme/kits" publishes none of the kits named "preflight", "default", so the run ran none of its kits.',
    );
    expect(warning?.remedy).toBe(
      'Run its kits by name with `rdy run --sources drift`, or every kit with `rdy run --sources --all`. Its other kits: audit.',
    );
  });

  it('lists one warning per source, in order', () => {
    const warnings = listUnrunSourceWarnings([
      { spelling: 'npm:a', requestedNames: ['default'], publishedNames: ['x'] },
      { spelling: 'npm:b', requestedNames: ['default'], publishedNames: ['y'] },
    ]);

    expect(warnings.map((warning) => warning.message)).toStrictEqual([
      expect.stringMatching(/^configured source "npm:a"/),
      expect.stringMatching(/^configured source "npm:b"/),
    ]);
  });
});

describe(formatEmptySelection, () => {
  it('keeps the bare line when no source was left unrun', () => {
    expect(formatEmptySelection([])).toBe('No kits to run.');
  });

  it('names the requested kit and the alternatives', () => {
    const text = formatEmptySelection([{ spelling: 'npm:a', requestedNames: ['default'], publishedNames: ['x'] }]);

    expect(text.split('\n', 1)[0]).toBe('No kits to run: no configured source publishes a kit named "default".');
    expect(text).toContain('`rdy run --sources <kit>`');
    expect(text).toContain('`rdy run --sources --all`');
    expect(text).toContain('`rdy list --sources`');
  });
});
