import { readFileSync } from 'node:fs';
import path from 'node:path';

import { findPackageRoot } from '@williamthorsen/toolbelt.packaging/candidate';

import { internalError } from '../errors/RdyError.ts';

/**
 * Reads one section of readyup's own README, heading line included.
 *
 * The package root is resolved from this module rather than from the working directory, so the same
 * expression finds the README whether rdy runs from an install, from its build output, or from
 * TypeScript source. npm ships `README.md` in every tarball, so no manifest entry declares it.
 */
export function readReadmeSection(heading: string): string {
  const readmePath = path.join(findPackageRoot(import.meta.url), 'README.md');

  let markdown: string;
  try {
    markdown = readFileSync(readmePath, 'utf8');
  } catch (error: unknown) {
    throw internalError(`Could not read readyup's README at ${readmePath}.`, { cause: error });
  }

  const section = extractSection(markdown, heading);
  if (section === undefined) {
    throw internalError(`readyup's README has no "## ${heading}" section.`);
  }

  return section;
}

/**
 * Returns a level-2 section, from its heading through the line before the next level-2 heading, or
 * `undefined` when the markdown carries no such heading.
 *
 * Deeper headings are content rather than boundaries, so a `###` subsection comes back with its
 * parent. Headings inside a fenced code block are text, and neither open a section nor close one.
 */
export function extractSection(markdown: string, heading: string): string | undefined {
  const lines = markdown.split('\n');
  const target = `## ${heading}`;

  let start: number | undefined;
  let fenced = false;

  for (const [index, line] of lines.entries()) {
    if (line.startsWith('```')) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    if (start === undefined) {
      if (line.trimEnd() === target) start = index;
    } else if (line.startsWith('## ')) {
      return joinSection(lines.slice(start, index));
    }
  }

  return start === undefined ? undefined : joinSection(lines.slice(start));
}

// region | Helpers

/** Joins a section's lines, dropping the blank lines that separated it from whatever followed. */
function joinSection(lines: string[]): string {
  return `${lines.join('\n').trimEnd()}\n`;
}

// endregion | Helpers
