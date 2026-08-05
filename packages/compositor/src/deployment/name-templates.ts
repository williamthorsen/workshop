/** Name templates: the name one artifact deploys under, rendered from its slug and recovered from a deployed tree. */

import { escapeForRegExp } from '../portable/escapeForRegExp.ts';

/** The placeholder a kind's name template stands its artifact's slug in. */
export const SLUG_PLACEHOLDER = '{slug}';

/**
 * Recovers the slug a deployed name was rendered from, or nothing where the template could not have produced it.
 *
 * This is what lets a scan over a destination tell a file the engine deployed from one somebody else put there, the
 * name being the whole of what a previously deployed file carries about which artifact it came from.
 *
 * The match is anchored, so a template's literal parts have to account for the whole name rather than appear somewhere
 * inside it. An absent template inverts any name to itself, matching the render; a template standing no placeholder
 * inverts nothing, no name being able to recover a slug from one. A template standing its placeholder more than once
 * inverts by back-reference, which is what `replaceAll` writes.
 */
export function invertDeployedName(template: string | undefined, name: string): string | undefined {
  if (template === undefined) {
    return name === '' ? undefined : name;
  }

  const [head = '', ...rest] = template.split(SLUG_PLACEHOLDER).map(escapeForRegExp);
  if (rest.length === 0) {
    return undefined;
  }

  const tail = rest.map((literal, index) => `${index === 0 ? '(.+)' : String.raw`\1`}${literal}`).join('');
  return new RegExp(`^${head}${tail}$`).exec(name)?.[1];
}

/**
 * Renders a kind's name template for one slug, treating an absent template as the slug itself.
 *
 * The substitution goes through a function rather than a string, so a slug carrying `$&` or `$'` is inserted verbatim
 * instead of being read as a replacement pattern.
 */
export function renderDeployedName(template: string | undefined, slug: string): string {
  return template === undefined ? slug : template.replaceAll(SLUG_PLACEHOLDER, () => slug);
}
