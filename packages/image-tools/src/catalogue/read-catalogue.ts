import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { isRecord } from '@williamthorsen/toolbelt.objects';
import { findPackageRoot } from '@williamthorsen/toolbelt.packaging';
import { parse } from 'yaml';

import { SUBJECT_PLACEHOLDER } from './fill-template.ts';

/** A named visual style: prompt templates in which the subject replaces the placeholder. */
export interface Style {
  readonly name: string;
  readonly negativePrompt: string | undefined;
  readonly prompt: string;
}

/** The outcome of reading a catalogue: its styles in file order, or every problem found in it. */
export type CatalogueResult = { ok: true; styles: readonly Style[] } | { ok: false; problems: readonly string[] };

/** The selector that names every style of the catalogue, which a style therefore cannot take as its name. */
export const ALL_STYLES = 'all';

/** The catalogue that ships with the package. */
export const CATALOGUE_PATH = path.join(findPackageRoot(import.meta.url), 'catalogue', 'styles.yaml');

/** Reads and validates the catalogue at `cataloguePath`. */
export function readCatalogue(cataloguePath: string): CatalogueResult {
  let document: unknown;
  try {
    document = parse(readFileSync(cataloguePath, 'utf8'));
  } catch (error) {
    return { ok: false, problems: [`${cataloguePath}: ${describeError(error)}`] };
  }
  if (!Array.isArray(document)) {
    return { ok: false, problems: [`${cataloguePath}: the catalogue must be a list of styles`] };
  }

  const problems: string[] = [];
  const styles: Style[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of document.entries()) {
    const label = `${cataloguePath}: entry ${index + 1}`;
    const style = readStyle(entry, label, problems);
    if (style === undefined) continue;
    if (seen.has(style.name)) {
      problems.push(`${label}: the name ${style.name} is already taken`);
      continue;
    }
    seen.add(style.name);
    styles.push(style);
  }
  return problems.length === 0 ? { ok: true, styles } : { ok: false, problems };
}

// region | Helpers

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const KNOWN_KEYS = new Set(['name', 'negative_prompt', 'prompt']);

/** Counts the occurrences of the subject placeholder in `template`. */
function countPlaceholders(template: string): number {
  return template.split(SUBJECT_PLACEHOLDER).length - 1;
}

/** Validates one catalogue entry, appending each problem to `problems` and returning the style when it has none. */
function readStyle(entry: unknown, label: string, problems: string[]): Style | undefined {
  if (!isRecord(entry)) {
    problems.push(`${label}: a style must be a mapping of name, prompt, and an optional negative_prompt`);
    return undefined;
  }
  const before = problems.length;
  const { name, negative_prompt: negativePrompt, prompt } = entry;

  for (const key of Object.keys(entry)) {
    if (!KNOWN_KEYS.has(key)) {
      problems.push(`${label}: unknown key ${key}; a style takes name, prompt, and negative_prompt`);
    }
  }
  if (typeof name !== 'string' || !KEBAB_CASE.test(name)) {
    problems.push(`${label}: name must be a kebab-case string`);
  } else if (name === ALL_STYLES) {
    problems.push(`${label}: ${ALL_STYLES} is reserved for selecting every style`);
  }
  if (typeof prompt !== 'string' || countPlaceholders(prompt) !== 1) {
    problems.push(`${label}: prompt must be a string that contains ${SUBJECT_PLACEHOLDER} exactly once`);
  }
  if (negativePrompt !== undefined && typeof negativePrompt !== 'string') {
    problems.push(`${label}: negative_prompt must be a string`);
  }
  if (problems.length > before || typeof name !== 'string' || typeof prompt !== 'string') return undefined;

  return { name, negativePrompt: typeof negativePrompt === 'string' ? negativePrompt : undefined, prompt };
}

// endregion | Helpers
