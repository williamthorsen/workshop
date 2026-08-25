import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { describe, expect, it } from 'vitest';

import type { DirectiveSyntax } from '../../schemas/render-target-schemas.ts';
import type { Transclusion } from '../expandTransclusions.ts';
import { expandTransclusions } from '../expandTransclusions.ts';
import { joinSegments } from '../joinSegments.ts';

const COMMENT: DirectiveSyntax = { open: '<!--', close: '-->' };

describe(expandTransclusions, () => {
  it('returns a body with no directives as one unattributed segment', async () => {
    using tree = createTempTree({ 'skills/review.md': '# Review\n\nRead the diff.\n' });

    const result = await expand(tree.dir, 'skills/review.md');

    expect(requireExpanded(result).segments).toStrictEqual([{ lines: ['# Review', '', 'Read the diff.', ''] }]);
    expect(requireExpanded(result).partials).toStrictEqual([]);
  });

  it('attributes a transcluded partial to the partial, and the surrounding lines to the host', async () => {
    using tree = createTempTree({
      '_data/shared.md': 'Shared text.\n',
      'skills/review.md': '# Review\n\n<!-- include: ../_data/shared.md / -->\n\nDone.\n',
    });

    const result = await expand(tree.dir, 'skills/review.md');

    expect(requireExpanded(result).segments).toStrictEqual([
      { lines: ['# Review', ''] },
      { lines: ['Shared text.'], partialId: 'team:_data/shared.md' },
      { lines: ['', 'Done.', ''] },
    ]);
  });

  it('produces the body the directives describe, with no blank line where a partial ended in a newline', async () => {
    using tree = createTempTree({
      '_data/shared.md': 'Shared text.\n',
      'skills/review.md': '# Review\n\n<!-- include: ../_data/shared.md / -->\n\nDone.\n',
    });

    const result = await expand(tree.dir, 'skills/review.md');

    expect(joinSegments(requireExpanded(result).segments)).toBe('# Review\n\nShared text.\n\nDone.\n');
  });

  it('attributes slot content to the caller rather than to the partial that frames it', async () => {
    using tree = createTempTree({
      '_data/frame.md': 'Before.\n<!-- children -->\nAfter.\n',
      'skills/review.md': '<!-- include: ../_data/frame.md -->\nBody line.\n<!-- /include -->\n',
    });

    const result = await expand(tree.dir, 'skills/review.md');

    expect(requireExpanded(result).segments).toStrictEqual([
      { lines: ['Before.'], partialId: 'team:_data/frame.md' },
      { lines: ['Body line.'] },
      { lines: ['After.'], partialId: 'team:_data/frame.md' },
      { lines: [''] },
    ]);
  });

  it('attributes each partial in a nesting chain to itself, and the slot to the caller beneath them', async () => {
    using tree = createTempTree({
      '_data/inner.md': 'Inner.\n',
      '_data/frame.md': 'Before.\n<!-- include: inner.md / -->\n<!-- children -->\n',
      'skills/review.md': '<!-- include: ../_data/frame.md -->\nBody line.\n<!-- /include -->',
    });

    const result = await expand(tree.dir, 'skills/review.md');

    expect(requireExpanded(result).segments).toStrictEqual([
      { lines: ['Before.'], partialId: 'team:_data/frame.md' },
      { lines: ['Inner.'], partialId: 'team:_data/inner.md' },
      { lines: ['Body line.'] },
    ]);
  });

  it('reports each partial it read, with the id, path, and digest a plan records', async () => {
    using tree = createTempTree({
      '_data/inner.md': 'Inner.\n',
      '_data/frame.md': 'Before.\n<!-- include: inner.md / -->\n<!-- children -->\n',
      'skills/review.md': '<!-- include: ../_data/frame.md -->\nBody line.\n<!-- /include -->',
    });

    const result = await expand(tree.dir, 'skills/review.md');
    const partials = requireExpanded(result).partials;

    expect(partials.map(({ id, sourceId, path }) => ({ id, sourceId, path }))).toStrictEqual([
      { id: 'team:_data/frame.md', sourceId: 'team', path: '_data/frame.md' },
      { id: 'team:_data/inner.md', sourceId: 'team', path: '_data/inner.md' },
    ]);
    expect(partials.every(({ hash }) => hash.startsWith('sha256:'))).toBe(true);
  });

  it('expands identically behind a fence that runs to the end of the line', async () => {
    const files = {
      '_data/shared.md': 'Shared text.\n',
      'skills/review.md': '# Review\n\n# include: ../_data/shared.md /\n\nDone.\n',
    };
    using tree = createTempTree(files);

    const result = await expand(tree.dir, 'skills/review.md', { open: '#', close: '' });

    expect(joinSegments(requireExpanded(result).segments)).toBe('# Review\n\nShared text.\n\nDone.\n');
  });

  it('if a directive reaches a file already being expanded, reports the cycle at the directive', async () => {
    using tree = createTempTree({
      '_data/loop.md': '<!-- include: loop.md / -->\n',
      'skills/review.md': '<!-- include: ../_data/loop.md / -->\n',
    });

    const result = await expand(tree.dir, 'skills/review.md');

    expect(requireFailed(result).code).toBe('cycle');
    expect(requireFailed(result).at).toStrictEqual({ path: '_data/loop.md', line: 1 });
  });

  it('if a directive names a missing target, reports it at the directive', async () => {
    using tree = createTempTree({ 'skills/review.md': '<!-- include: ../_data/absent.md / -->\n' });

    const result = await expand(tree.dir, 'skills/review.md');

    expect(requireFailed(result).code).toBe('not-found');
    expect(requireFailed(result).at).toStrictEqual({ path: 'skills/review.md', line: 1 });
  });

  it('if a directive names a directory, reports it rather than failing at the read', async () => {
    using tree = createTempTree({
      '_data/shared.md': 'Shared text.\n',
      'skills/review.md': '<!-- include: ../_data / -->\n',
    });

    const result = await expand(tree.dir, 'skills/review.md');

    expect(requireFailed(result).code).toBe('not-found');
    expect(requireFailed(result).message).toContain('is not a file');
  });

  it('if the entry file marks a slot no directive can fill, reports it rather than shipping the markup', async () => {
    using tree = createTempTree({ 'skills/review.md': 'Lead.\n<!-- children -->\nTail.\n' });

    const result = await expand(tree.dir, 'skills/review.md');

    expect(requireFailed(result).code).toBe('orphan-children');
    expect(requireFailed(result).at).toStrictEqual({ path: 'skills/review.md', line: 2 });
  });

  it('if a directive escapes the source, reports it rather than reading from outside', async () => {
    using tree = createTempTree({ 'skills/review.md': '<!-- include: ../../outside.md / -->\n' });

    const result = await expand(tree.dir, 'skills/review.md');

    expect(requireFailed(result).code).toBe('out-of-tree');
  });

  it('if a close directive opens nothing, reports it at the stray close', async () => {
    using tree = createTempTree({ 'skills/review.md': 'Body.\n<!-- /include -->\n' });

    const result = await expand(tree.dir, 'skills/review.md');

    expect(requireFailed(result).code).toBe('orphan-close');
    expect(requireFailed(result).at).toStrictEqual({ path: 'skills/review.md', line: 2 });
  });

  it('if an open directive is never closed, reports it at the open', async () => {
    using tree = createTempTree({
      '_data/frame.md': '<!-- children -->\n',
      'skills/review.md': 'Lead.\n<!-- include: ../_data/frame.md -->\nBody.\n',
    });

    const result = await expand(tree.dir, 'skills/review.md');

    expect(requireFailed(result).code).toBe('unclosed-open');
    expect(requireFailed(result).at).toStrictEqual({ path: 'skills/review.md', line: 2 });
  });

  it('if a partial has no children placeholder, reports the slot it cannot hold', async () => {
    using tree = createTempTree({
      '_data/frame.md': 'Framed.\n',
      'skills/review.md': '<!-- include: ../_data/frame.md -->\nBody.\n<!-- /include -->\n',
    });

    const result = await expand(tree.dir, 'skills/review.md');

    expect(requireFailed(result).code).toBe('slot-without-children');
    expect(requireFailed(result).message).toContain('_data/frame.md');
  });

  it('if a directive matches no recognized shape, rejects it rather than emitting it as text', async () => {
    using tree = createTempTree({ 'skills/review.md': '<!-- include: _data/shared.md extra -->\n' });

    const result = await expand(tree.dir, 'skills/review.md');

    expect(requireFailed(result).code).toBe('unrecognized-parameter');
  });

  it('accepts a partial with a placeholder that no slot fills, dropping the placeholder line', async () => {
    using tree = createTempTree({
      '_data/frame.md': 'Before.\n<!-- children -->\nAfter.\n',
      'skills/review.md': '<!-- include: ../_data/frame.md / -->\n',
    });

    const result = await expand(tree.dir, 'skills/review.md');

    expect(joinSegments(requireExpanded(result).segments)).toBe('Before.\nAfter.\n');
  });
});

// region | Helpers

/** Expands one entry file within a temporary tree standing in for the `team` source. */
async function expand(dir: string, entryPath: string, syntax: DirectiveSyntax = COMMENT): Promise<Transclusion> {
  return expandTransclusions(entryPath, { id: 'team', dir }, syntax);
}

/** Narrows a result to its expanded form, failing the test with the diagnostic when it is not one. */
function requireExpanded(result: Transclusion): Extract<Transclusion, { status: 'expanded' }> {
  if (result.status !== 'expanded') {
    throw new Error(`Expected an expansion, but it failed: ${result.diagnostic.message}`);
  }
  return result;
}

/** Narrows a result to the diagnostic that stopped it. */
function requireFailed(result: Transclusion): Extract<Transclusion, { status: 'failed' }>['diagnostic'] {
  if (result.status !== 'failed') {
    throw new Error('Expected the expansion to fail, but it produced a body.');
  }
  return result.diagnostic;
}

// endregion | Helpers
