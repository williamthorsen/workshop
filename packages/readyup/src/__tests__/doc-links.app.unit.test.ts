import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const packageDir = path.resolve(import.meta.dirname, '../..');
const docsDir = 'docs';

/** One relative link, resolved against the file that holds it. */
interface DocLink {
  /** Anchor named by the link, or `undefined` where the link names a file alone. */
  anchor: string | undefined;

  /** File holding the link, relative to the package root. */
  source: string;

  /** File named by the link, relative to the package root. */
  target: string;

  /** The link as written, which is how the failure report names it. */
  written: string;
}

/**
 * Guards the cross-references between the README and the files under `docs/`.
 *
 * Most of the reference material lives in `docs/`, so a cross-reference is a link between two files
 * rather than a same-page anchor, and nothing else notices when a moved section or a renamed heading
 * leaves one pointing at nothing.
 */
describe('documentation links', () => {
  it('resolves every relative link and anchor', () => {
    const sources = ['README.md', ...listDocFiles()];
    const anchorsByFile = new Map<string, Set<string>>();

    const failures = sources
      .flatMap((source) => listLinks(source))
      .map((link) => describeFailure(link, anchorsByFile))
      .filter((failure) => failure !== undefined);

    expect(failures).toStrictEqual([]);
  });

  it('links every doc file from the README', () => {
    const linked = new Set(listLinks('README.md').map((link) => link.target));

    expect(listDocFiles().filter((file) => !linked.has(file))).toStrictEqual([]);
  });
});

// region | Helpers

/** Why a link does not resolve, or `undefined` where it does. */
function describeFailure(link: DocLink, anchorsByFile: Map<string, Set<string>>): string | undefined {
  if (!existsSync(path.join(packageDir, link.target))) {
    return `${link.source}: ${link.written} names no file at ${link.target}`;
  }
  if (link.anchor === undefined || !link.target.endsWith('.md')) return undefined;

  const anchors = anchorsByFile.get(link.target) ?? listAnchors(link.target);
  anchorsByFile.set(link.target, anchors);

  if (anchors.has(link.anchor)) return undefined;
  return `${link.source}: ${link.written} names no heading in ${link.target}`;
}

/** Whether a link destination is relative, and so one that this suite resolves. */
function isRelativeDestination(destination: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(destination) && !destination.startsWith('//');
}

/** Anchors that GitHub derives from the headings of one Markdown file, relative to the package root. */
function listAnchors(file: string): Set<string> {
  const anchors = new Set<string>();
  const occurrences = new Map<string, number>();

  for (const line of listProseLines(file)) {
    const heading = /^#{1,6} +(.+)$/.exec(line);
    if (heading === null) continue;

    const base = toAnchor(heading[1] ?? '');
    const seen = occurrences.get(base) ?? 0;
    occurrences.set(base, seen + 1);
    anchors.add(seen === 0 ? base : `${base}-${seen}`);
  }

  return anchors;
}

/** Markdown files under `docs/`, each relative to the package root. */
function listDocFiles(): string[] {
  return readdirSync(path.join(packageDir, docsDir))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `${docsDir}/${name}`)
    .toSorted();
}

/** Relative links held by one file, absolute URLs and anything inside code excluded. */
function listLinks(source: string): DocLink[] {
  return listProseLines(source)
    .flatMap((line) =>
      line
        .replaceAll(/`[^`]*`/g, '')
        .matchAll(/\]\(([^)\s]+)/g)
        .toArray(),
    )
    .filter(([, destination = '']) => isRelativeDestination(destination))
    .map(([written, destination = '']) => {
      const [file, anchor] = splitAnchor(destination);
      const target = file === '' ? source : path.posix.join(path.posix.dirname(source), file);

      return { anchor, source, target, written: `${written})` };
    });
}

/** Lines of one Markdown file that sit outside a fenced code block. */
function listProseLines(file: string): string[] {
  const lines = readFileSync(path.join(packageDir, file), 'utf8').split('\n');
  const prose: string[] = [];
  let fenced = false;

  for (const line of lines) {
    if (line.startsWith('```')) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) prose.push(line);
  }

  return prose;
}

/** Splits a link destination into its file part and its anchor, which is `undefined` where it names none. */
function splitAnchor(destination: string): [string, string | undefined] {
  const hash = destination.indexOf('#');
  return hash === -1 ? [destination, undefined] : [destination.slice(0, hash), destination.slice(hash + 1)];
}

/** Anchor that GitHub derives from a heading's text. */
function toAnchor(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 \-_]/g, '')
    .replaceAll(' ', '-');
}

// endregion | Helpers
