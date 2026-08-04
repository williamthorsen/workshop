import { Document, isMap, parseDocument } from 'yaml';

import { parseFrontmatter } from './parseFrontmatter.ts';

/**
 * The metadata a target overlays onto the artifacts it renders.
 *
 * `defaults` applies to every artifact and `overrides` to one, keyed by slug, so a target states a rule once and
 * departs from it where it must. The two are separate fields rather than a reserved key beside the slugs, which is
 * what keeps an artifact from being unaddressable because its slug named the bucket.
 */
export interface FrontmatterOverlay {
  readonly defaults?: Record<string, unknown>;
  readonly overrides?: Record<string, Record<string, unknown>>;
}

/**
 * Overlays a target's metadata onto one artifact's frontmatter, leaving its body verbatim.
 *
 * The block is parsed and re-emitted rather than rewritten line by line. The line-based original could only replace a
 * key whose value sat on the key's own line, so an override aimed at a block sequence replaced the key and orphaned
 * the indented lines beneath it, leaving YAML that no longer parses. It avoided that by requiring flow sequences in
 * every overlay, which is not a constraint an engine can put on consumer-supplied data.
 *
 * Re-emitting through the document API also keeps the comments and the formatting of every key the overlay does not
 * touch, which the line-based version preserved only incidentally, by passing lines it did not recognize through.
 *
 * Keys already present keep their position and new keys append in sorted order, so an artifact's frontmatter does not
 * reshuffle because an overlay grew. An artifact no override applies to is returned byte for byte.
 *
 * Throws on a frontmatter block that is not a mapping, and on one that is never closed: no reading of either lets the
 * overlay apply, and every alternative to failing loses content the artifact declared.
 */
export function mergeFrontmatter(content: string, overlay: FrontmatterOverlay, slug: string): string {
  const applied = { ...overlay.defaults, ...overlay.overrides?.[slug] };
  if (Object.keys(applied).length === 0) {
    return content;
  }

  const { frontmatter, body, unterminated } = parseFrontmatter(content);
  if (unterminated) {
    throw new Error(`Cannot overlay metadata onto "${slug}": its frontmatter block is never closed.`);
  }

  // An artifact declaring no metadata starts from an empty mapping, which is what lets a block be written where the
  // artifact carried none.
  const document: Document =
    frontmatter === undefined || frontmatter.trim() === '' ? new Document({}) : parseDocument(frontmatter);

  if (document.errors.length > 0) {
    const messages = document.errors.map((error) => error.message).join('; ');
    throw new Error(`Cannot overlay metadata onto "${slug}": its frontmatter is not valid YAML: ${messages}`);
  }
  if (!isMap(document.contents)) {
    throw new Error(`Cannot overlay metadata onto "${slug}": its frontmatter is not a mapping.`);
  }

  const keys = Object.keys(applied);
  const declared = keys.filter((key) => document.has(key));
  const added = keys.filter((key) => !document.has(key)).toSorted();

  // Replace what is already declared before appending what is not, so added keys land together and in order.
  for (const key of [...declared, ...added]) {
    document.set(key, applied[key]);
  }

  return `---\n${document.toString()}---\n${body}`;
}
