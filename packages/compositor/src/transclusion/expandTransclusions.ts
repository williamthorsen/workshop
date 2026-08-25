import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { compareStrings } from '../portable/compareStrings.ts';
import { hashUtf8 } from '../portable/hash-content.ts';
import { statIfPresent } from '../portable/statIfPresent.ts';
import { toPosix } from '../portable/toPosix.ts';
import type { PartialEntry } from '../schemas/graph-schemas.ts';
import type { DirectiveSyntax } from '../schemas/render-target-schemas.ts';
import type { PartialId, SourceId } from '../schemas/scalar-schemas.ts';
import type { DirectivePatterns } from './buildDirectivePatterns.ts';
import { buildDirectivePatterns } from './buildDirectivePatterns.ts';
import { composePartialId } from './composePartialId.ts';
import type { DirectiveRef, TransclusionDiagnostic, TransclusionFailure } from './TransclusionDiagnostic.ts';

/** One run of expanded lines, attributed to the file an author wrote them in. */
export interface Segment {
  readonly lines: ReadonlyArray<string>;
  /** Absent when the lines came from the artifact's own file. */
  readonly partialId?: PartialId;
}

/** An expanded body with the partials it drew from, or the directive that stopped the expansion. */
export type Transclusion =
  | {
      readonly status: 'expanded';
      readonly segments: ReadonlyArray<Segment>;
      readonly partials: ReadonlyArray<PartialEntry>;
    }
  | { readonly status: 'failed'; readonly diagnostic: TransclusionDiagnostic };

/** The source an expansion resolves within: nothing outside `dir` is reachable from a directive. */
export interface TransclusionSource {
  readonly id: SourceId;
  readonly dir: string;
}

/**
 * Expands every directive reachable from `entryPath`, returning the result as segments that each name the file their
 * lines came from.
 *
 * `entryPath` is relative to `source.dir`, and each directive's target resolves against the directory of the file
 * containing it. Slot content keeps the attribution of the file that supplied it rather than of the partial framing it,
 * so a token traces to the file an author wrote it in.
 *
 * A directive that cannot be resolved ends the expansion and comes back as a diagnostic, since a cycle or a missing
 * target leaves no body to continue with. An unreadable file throws: a permissions fault is not an authoring mistake.
 */
export async function expandTransclusions(
  entryPath: string,
  source: TransclusionSource,
  syntax: DirectiveSyntax,
): Promise<Transclusion> {
  const context: ExpansionContext = {
    partials: new Map(),
    patterns: buildDirectivePatterns(syntax),
    root: path.resolve(source.dir),
    sourceId: source.id,
    visited: new Set(),
  };

  try {
    const segments = await expandFile(path.resolve(context.root, entryPath), context, undefined);
    const partials = context.partials
      .values()
      .toArray()
      .toSorted((left, right) => compareStrings(left.id, right.id));
    return { status: 'expanded', segments, partials };
  } catch (error) {
    if (error instanceof DirectiveFailure) {
      return { status: 'failed', diagnostic: error.diagnostic };
    }
    throw error;
  }
}

// region | Helpers

/** Routes `incoming` to the open frame's slot, or to the file's own output when no frame is open. */
function appendSegments(stack: Array<OpenFrame>, out: Array<MutableSegment>, incoming: ReadonlyArray<Segment>): void {
  pushMerged(stack.at(-1)?.slot ?? out, incoming);
}

/** Builds a segment, omitting the attribution rather than recording it as `undefined`. */
function createSegment(lines: Array<string>, partialId: PartialId | undefined): MutableSegment {
  return partialId === undefined ? { lines } : { lines, partialId };
}

/** Takes a diagnostic out of the recursion to the one boundary that turns it back into data. */
class DirectiveFailure extends Error {
  override readonly name = 'DirectiveFailure';
  readonly diagnostic: TransclusionDiagnostic;

  constructor(diagnostic: TransclusionDiagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

/** Expands one file's own lines, attributing each to `attribution` and resolving the directives among them. */
async function expandFile(
  filePath: string,
  context: ExpansionContext,
  attribution: PartialId | undefined,
): Promise<Array<MutableSegment>> {
  context.visited.add(filePath);
  try {
    const host = toPosix(path.relative(context.root, filePath));
    const lines = (await readFile(filePath, 'utf8')).split('\n');
    const out: Array<MutableSegment> = [];
    const stack: Array<OpenFrame> = [];

    for (const [index, line] of lines.entries()) {
      const at: DirectiveRef = { path: host, line: index + 1 };

      // Test self-close before open: both match a path, and the trailing slash is what tells them apart.
      const selfClose = context.patterns.selfClose.exec(line);
      const close = selfClose === null ? context.patterns.close.exec(line) : null;
      const open = selfClose === null && close === null ? context.patterns.open.exec(line) : null;

      const selfCloseTarget = selfClose?.[1];
      if (selfCloseTarget !== undefined) {
        const resolved = await resolveTarget(filePath, selfCloseTarget, context, at);
        appendSegments(stack, out, await expandPartial(resolved, [], context, at));
        continue;
      }

      if (close !== null) {
        const frame = stack.pop();
        if (frame === undefined) {
          throw fail('orphan-close', 'closes a directive that was never opened', at);
        }
        const opened: DirectiveRef = { path: host, line: frame.lineNumber };
        appendSegments(stack, out, await expandPartial(frame.resolved, frame.slot, context, opened));
        continue;
      }

      const openTarget = open?.[1];
      if (openTarget !== undefined) {
        const resolved = await resolveTarget(filePath, openTarget, context, at);
        stack.push({ lineNumber: index + 1, resolved, slot: [], target: openTarget });
        continue;
      }

      if (context.patterns.anyInclude.test(line)) {
        throw fail('unrecognized-parameter', `matches no directive shape: "${line}"`, at);
      }

      // Only a transcluded partial has a caller whose content could fill the slot a placeholder marks.
      if (attribution === undefined && context.patterns.children.test(line)) {
        throw fail('orphan-children', 'marks a slot in a body no directive transcludes', at);
      }

      appendSegments(stack, out, [createSegment([line], attribution)]);
    }

    const unclosed = stack.at(-1);
    if (unclosed !== undefined) {
      const opened: DirectiveRef = { path: host, line: unclosed.lineNumber };
      throw fail('unclosed-open', `opens "${unclosed.target}" and is never closed`, opened);
    }

    return out;
  } finally {
    context.visited.delete(filePath);
  }
}

/**
 * Expands one partial and fills its slot with `slot`, registering the partial so the caller learns what it drew from.
 *
 * `at` locates the directive that reached this partial, so a cycle or an unfillable slot is reported against the line
 * an author wrote rather than against the partial that ends up containing the fault.
 */
async function expandPartial(
  partialPath: string,
  slot: ReadonlyArray<Segment>,
  context: ExpansionContext,
  at: DirectiveRef,
): Promise<Array<MutableSegment>> {
  const partialPosixPath = toPosix(path.relative(context.root, partialPath));

  if (context.visited.has(partialPath)) {
    const chain = [...context.visited, partialPath].map((entry) => toPosix(path.relative(context.root, entry)));
    throw fail('cycle', `reaches a file already being expanded: ${chain.join(' -> ')}`, at);
  }

  const partialId = composePartialId(context.sourceId, partialPosixPath);
  const content = await readFile(partialPath, 'utf8');
  context.partials.set(partialId, {
    id: partialId,
    sourceId: context.sourceId,
    path: partialPosixPath,
    hash: hashUtf8(content),
  });

  const expanded = await expandFile(partialPath, context, partialId);
  const placeholder = findPlaceholder(expanded, context.patterns);
  if (placeholder === undefined) {
    if (slot.length > 0) {
      const detail = `fills a slot in "${partialPosixPath}", which has no children placeholder`;
      throw fail('slot-without-children', detail, at);
    }
    return trimTrailingEmptyLine(expanded);
  }

  return trimTrailingEmptyLine(spliceSlot(expanded, placeholder, slot));
}

/** Everything one expansion collects from the entry file down through every partial it reaches. */
interface ExpansionContext {
  readonly partials: Map<PartialId, PartialEntry>;
  readonly patterns: DirectivePatterns;
  readonly root: string;
  readonly sourceId: SourceId;
  readonly visited: Set<string>;
}

/** Raises a diagnostic naming what the directive at `at` could not do. */
function fail(code: TransclusionFailure, detail: string, at: DirectiveRef): DirectiveFailure {
  return new DirectiveFailure({ code, message: `The directive at ${at.path}:${at.line} ${detail}.`, at });
}

/**
 * Locates the first children placeholder among `segments`.
 *
 * A nested partial's own placeholder is substituted before its lines reach here, so every placeholder this finds
 * belongs to the partial being expanded.
 */
function findPlaceholder(segments: ReadonlyArray<Segment>, patterns: DirectivePatterns): PlaceholderSite | undefined {
  for (const [segment, { lines }] of segments.entries()) {
    for (const [line, text] of lines.entries()) {
      if (patterns.children.test(text)) {
        return { segment, line };
      }
    }
  }
  return undefined;
}

/** A segment still being built, before it is handed out behind the readonly view. */
interface MutableSegment {
  lines: Array<string>;
  partialId?: PartialId;
}

/** An unclosed directive, accumulating the slot content between its open and its close. */
interface OpenFrame {
  readonly lineNumber: number;
  readonly resolved: string;
  readonly slot: Array<MutableSegment>;
  readonly target: string;
}

/** Where a children placeholder sits within an expanded partial. */
interface PlaceholderSite {
  readonly segment: number;
  readonly line: number;
}

/** Appends `incoming` to `target`, folding into the tail segment when the two share an attribution. */
function pushMerged(target: Array<MutableSegment>, incoming: ReadonlyArray<Segment>): void {
  for (const segment of incoming) {
    const tail = target.at(-1);
    if (tail !== undefined && tail.partialId === segment.partialId) {
      tail.lines.push(...segment.lines);
      continue;
    }
    target.push(createSegment([...segment.lines], segment.partialId));
  }
}

/**
 * Resolves a directive's target against the directory of the file containing it.
 *
 * Containment is lexical: a symlink under the source pointing outside it is not resolved, because a source tree is not
 * expected to contain symlinks.
 *
 * A target must be a file. A directory passes the existence check the same way a file does, so a directive that
 * dropped its filename would otherwise pass this gate and fault at the read as an exception.
 */
async function resolveTarget(
  filePath: string,
  target: string,
  context: ExpansionContext,
  at: DirectiveRef,
): Promise<string> {
  const resolved = path.resolve(path.dirname(filePath), target);

  const relative = path.relative(context.root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw fail('out-of-tree', `names "${target}", which resolves outside the source`, at);
  }

  const stats = await statIfPresent(resolved);
  if (stats?.isFile() !== true) {
    const detail = stats === undefined ? 'does not exist' : 'is not a file';
    throw fail('not-found', `names "${target}", which ${detail}`, at);
  }

  return resolved;
}

/** Replaces the placeholder line with `slot`, leaving the lines around it under their own attribution. */
function spliceSlot(
  segments: ReadonlyArray<Segment>,
  placeholder: PlaceholderSite,
  slot: ReadonlyArray<Segment>,
): Array<MutableSegment> {
  const spliced: Array<MutableSegment> = [];
  for (const [index, segment] of segments.entries()) {
    if (index !== placeholder.segment) {
      pushMerged(spliced, [segment]);
      continue;
    }
    const before = segment.lines.slice(0, placeholder.line);
    const after = segment.lines.slice(placeholder.line + 1);
    if (before.length > 0) {
      pushMerged(spliced, [createSegment(before, segment.partialId)]);
    }
    pushMerged(spliced, slot);
    if (after.length > 0) {
      pushMerged(spliced, [createSegment(after, segment.partialId)]);
    }
  }
  return spliced;
}

/**
 * Drops the single trailing empty line that splitting a newline-terminated file produces.
 *
 * A partial ending in a newline therefore introduces no blank line at the site that transcluded it.
 */
function trimTrailingEmptyLine(segments: Array<MutableSegment>): Array<MutableSegment> {
  const tail = segments.at(-1);
  if (tail === undefined || tail.lines.at(-1) !== '') {
    return segments;
  }
  tail.lines.pop();
  return tail.lines.length > 0 ? segments : segments.slice(0, -1);
}

// endregion | Helpers
