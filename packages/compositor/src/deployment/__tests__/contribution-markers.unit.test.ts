import { describe, expect, it } from 'vitest';

import { readContributions } from '../../ownership/readContributions.ts';
import { renderContribution } from '../../ownership/renderContribution.ts';
import type { MarkerPair } from '../../schemas/render-target-schemas.ts';
import { buildContributionPatterns, renderContributionMarkers } from '../contribution-markers.ts';

const template: MarkerPair = { open: '<!-- {artifactId} -->', close: '<!-- /{artifactId} -->' };

describe(renderContributionMarkers, () => {
  it('stands the artifact id in for the placeholder in both markers', () => {
    expect(renderContributionMarkers(template, 'rulebook:naming')).toStrictEqual({
      open: '<!-- rulebook:naming -->',
      close: '<!-- /rulebook:naming -->',
    });
  });

  it('inserts an id carrying replacement-pattern syntax verbatim', () => {
    expect(renderContributionMarkers(template, 'rulebook:$&x').open).toBe('<!-- rulebook:$&x -->');
  });

  it('leaves a template standing no placeholder alone', () => {
    const fixed: MarkerPair = { open: '# open', close: '# close' };

    expect(renderContributionMarkers(fixed, 'rulebook:naming')).toStrictEqual(fixed);
  });
});

describe(buildContributionPatterns, () => {
  it('reads back every contribution written into a host, in document order', () => {
    const host = ['rulebook:naming', 'rulebook:style'].map((id) => write(id, `body of ${id}`)).join('\n');

    expect(readContributions(host, buildContributionPatterns(template))).toStrictEqual([
      { key: 'rulebook:naming', body: 'body of rulebook:naming' },
      { key: 'rulebook:style', body: 'body of rulebook:style' },
    ]);
  });

  // The open pattern matches a close marker line too, capturing a key nothing opened; pairing has to discard it.
  it('reads a host whose close markers the open pattern also matches', () => {
    const host = `preamble\n${write('rulebook:naming', 'one')}\ntrailer`;

    expect(readContributions(host, buildContributionPatterns(template))).toStrictEqual([
      { key: 'rulebook:naming', body: 'one' },
    ]);
  });

  it('reads back an id carrying regular-expression syntax', () => {
    const host = write('rulebook:a.b(c)', 'one');

    expect(readContributions(host, buildContributionPatterns(template))).toStrictEqual([
      { key: 'rulebook:a.b(c)', body: 'one' },
    ]);
  });

  // A YAML host indents the sequence its contributions sit in, and losing them to that indentation would rewrite them.
  it('reads a contribution whose host indented its markers', () => {
    const host = write('rulebook:naming', '  one')
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');

    expect(readContributions(host, buildContributionPatterns(template))).toStrictEqual([
      { key: 'rulebook:naming', body: '    one' },
    ]);
  });

  it('does not read a marker quoted inside a line of prose', () => {
    const host = `Write <!-- rulebook:naming --> to open the block.\n${write('rulebook:style', 'one')}`;

    expect(readContributions(host, buildContributionPatterns(template))).toStrictEqual([
      { key: 'rulebook:style', body: 'one' },
    ]);
  });

  it('refuses to read a host whose close template names no contributor, there being no key to pair by', () => {
    const fixed: MarkerPair = { open: '# open {artifactId}', close: '# close' };

    expect(() => readContributions('# open x\n# close', buildContributionPatterns(fixed))).toThrow(
      /exactly one capture group/,
    );
  });
});

// region | Helpers

/** Writes one artifact's contribution the way a plan would, through the markers its template renders. */
function write(artifactId: string, body: string): string {
  return renderContribution(renderContributionMarkers(template, artifactId), body);
}

// endregion | Helpers
