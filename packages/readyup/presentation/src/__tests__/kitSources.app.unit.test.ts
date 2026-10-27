import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { type CheckModel, KITS } from '../kits.ts';

const deckHtml = readFileSync(path.join(import.meta.dirname, '..', '..', 'index.html'), 'utf8');

/** Matches a check's marked name line in a kit page's source, capturing its index and its quoted name. */
const MARKED_CHECK = /<span class="chk" data-check="(\d+)">\s*name: <span class="s">'([^']*)'<\/span>/gu;

describe('the kit pages', () => {
  it.each(Object.entries(KITS))(
    'mark the checks of %s in its source in the order that its model runs them',
    (kitId, kit) => {
      expect(listMarkedChecks(kitId)).toStrictEqual(kit.checklists.flatMap(({ checks }) => listTreeOrder(checks)));
    },
  );
});

// region | Helpers

/** Returns the HTML entities in `text` that a check name can contain, decoded. */
function decodeEntities(text: string): string {
  return text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

/** Returns the check names marked in the source of the kit page whose `data-kit` is `kitId`, in `data-check` order. */
function listMarkedChecks(kitId: string): string[] {
  const section = deckHtml.split('<section').find((part) => part.includes(`data-kit="${kitId}"`));
  if (section === undefined) throw new Error(`index.html has no kit page for ${kitId}`);
  return section
    .matchAll(MARKED_CHECK)
    .map(([, index = '', name = '']) => ({ index: Number(index), name: decodeEntities(name) }))
    .toArray()
    .toSorted((left, right) => left.index - right.index)
    .map(({ name }) => name);
}

/** Returns the names of `checks` and their descendants, depth first. */
function listTreeOrder(checks: CheckModel[]): string[] {
  return checks.flatMap((check) => [check.name, ...listTreeOrder(check.checks ?? [])]);
}

// endregion | Helpers
