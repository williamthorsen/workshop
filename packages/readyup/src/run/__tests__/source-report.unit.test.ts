import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { formatEmptySelection, warnOnUnrunSources } from '../source-report.ts';

describe(warnOnUnrunSources, () => {
  it('names the requested kit that the source lacks and the kit that it publishes', () => {
    using _io = captureStdio();

    const warnings = warnOnUnrunSources([
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
    using _io = captureStdio();

    const [warning] = warnOnUnrunSources([
      { spelling: 'npm:@acme/kits', requestedNames: ['preflight', 'default'], publishedNames: ['drift', 'audit'] },
    ]);

    expect(warning?.message).toBe(
      'configured source "npm:@acme/kits" publishes none of the kits named "preflight", "default", so the run ran none of its kits.',
    );
    expect(warning?.remedy).toBe(
      'Run its kits by name with `rdy run --sources drift`, or every kit with `rdy run --sources --all`. Its other kits: audit.',
    );
  });

  it('writes one stderr line per source', () => {
    using io = captureStdio();

    warnOnUnrunSources([
      { spelling: 'npm:a', requestedNames: ['default'], publishedNames: ['x'] },
      { spelling: 'npm:b', requestedNames: ['default'], publishedNames: ['y'] },
    ]);

    expect(io.stderr.trimEnd().split('\n')).toHaveLength(2);
    expect(io.stderr).toMatch(/^Warning: configured source "npm:a"/);
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
