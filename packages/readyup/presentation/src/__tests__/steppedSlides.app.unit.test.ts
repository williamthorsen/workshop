import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const deckHtml = readFileSync(path.join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');

/** Matches a `data-at` attribute inside a tag, capturing its step. */
const STEP_ATTRIBUTE = /<[^>]*\sdata-at="(\d+)"/gu;

/** Matches a step fragment, one per step after a slide's opening state. */
const STEP_FRAGMENT = /class="fragment step"/gu;

describe('the stepped slides', () => {
  it('include the run and anatomy slides', () => {
    expect(listSteppedSlides().map(({ title }) => title)).toStrictEqual(
      expect.arrayContaining([
        'A failure blocks what depends on it, and the threshold decides the verdict',
        'A check is a claim, a test, and a fix',
      ]),
    );
  });

  it.each(listSteppedSlides().map((slide) => [slide.title, slide]))(
    'give "%s" one fragment per step',
    (_title, { fragments, lastStep }) => {
      expect(fragments).toBe(lastStep);
    },
  );
});

// region | Helpers

/**
 * Returns each slide whose markup binds elements to steps, with its step fragment count and its highest step. Kit pages
 * are left out, because the deck adds their fragments at run time.
 */
function listSteppedSlides(): Array<{ fragments: number; lastStep: number; title: string }> {
  return deckHtml
    .split('<section')
    .slice(1)
    .filter((section) => !/^[^>]*\sdata-kit=/u.test(section))
    .map((section) => ({
      fragments: section.match(STEP_FRAGMENT)?.length ?? 0,
      lastStep: Math.max(-1, ...section.matchAll(STEP_ATTRIBUTE).map(([, step = '']) => Number(step))),
      title: /^[^>]*\sdata-title="([^"]*)"/u.exec(section)?.[1] ?? '',
    }))
    .filter(({ lastStep }) => lastStep >= 0);
}

// endregion | Helpers
