import path from 'node:path';

import type { ArtifactId, PartialId } from '../schemas/scalar-schemas.ts';
import type { TokenKind } from '../schemas/token-kind-schemas.ts';
import type { Segment } from '../transclusion/expandTransclusions.ts';
import { compileLinkPattern } from './compileLinkPattern.ts';
import type { LinkDiagnostic, LinkRef } from './LinkDiagnostic.ts';

/** Everything rewriting one artifact's links for one target needs. */
export interface RewriteLinksInput {
  readonly segments: ReadonlyArray<Segment>;
  /** The link grammar, whose single capture group is the target. */
  readonly pattern: string;
  /** Recognizes a target that resolves to its own destination once the token rewrite has run. */
  readonly tokenKinds: ReadonlyArray<TokenKind>;
  /** The rendering file's own path, relative to `targetRoot`, which every relative target resolves against. */
  readonly filePath: string;
  readonly targetRoot: string;
  /** Names the artifact in a diagnostic, so an author sees which body to fix. */
  readonly host: ArtifactId;
}

/** A body whose links name their deployed destinations, with every target that could not be resolved. */
export interface LinkRewrite {
  readonly segments: ReadonlyArray<Segment>;
  readonly diagnostics: ReadonlyArray<LinkDiagnostic>;
}

/**
 * Rewrites every relative link target in `segments` to the absolute path it deploys at, keeping each segment's
 * attribution.
 *
 * Resolution is against `targetRoot` rather than against the tree the rendering file's own kind deploys into, so a
 * link that climbs out of one kind's tree and into another's lands where that other kind actually deploys.
 *
 * A target that already names its destination is left alone: an anchor, an absolute or home-relative path, anything
 * with a URI scheme, and anything opening with a declared token, which resolves to its own destination when the
 * token rewrite runs. That last case is why the delimiter is the consumer's: nothing here knows what a token looks
 * like beyond the patterns it was handed.
 *
 * A target climbing above `targetRoot` stays in the body verbatim and comes back as a diagnostic, since no absolute
 * path under that root could express where it points.
 */
export function rewriteLinks(input: RewriteLinksInput): LinkRewrite {
  const context: RewriteContext = {
    diagnostics: [],
    fileDir: path.posix.dirname(input.filePath),
    input,
    openers: input.tokenKinds.map((kind) => new RegExp(`^(?:${kind.pattern})`)),
    pattern: compileLinkPattern(input.pattern),
  };

  const segments = input.segments.map((segment) => {
    const lines = segment.lines.map((line) => rewriteLine(line, segment.partialId, context));
    return segment.partialId === undefined ? { lines } : { lines, partialId: segment.partialId };
  });

  return { segments, diagnostics: context.diagnostics };
}

// region | Helpers

/** Builds the diagnostic for a target that would not resolve, omitting the partial when there is none. */
function createDiagnostic(target: string, context: RewriteContext, partialId: PartialId | undefined): LinkDiagnostic {
  const { host, targetRoot } = context.input;
  const at: LinkRef = partialId === undefined ? { host, target } : { host, target, partialId };
  return {
    code: 'out-of-tree',
    message: `The link "${target}" in ${host} resolves above ${targetRoot}.`,
    at,
  };
}

/**
 * Reports whether `target` names its own destination and so resolves to nothing this pass can improve on.
 *
 * The token test is anchored rather than searched, because a token elsewhere in a target says nothing about where the
 * target starts from; only one at the head replaces the path this pass would otherwise build.
 */
function namesItsOwnDestination(target: string, openers: ReadonlyArray<RegExp>): boolean {
  return (
    target.startsWith('#') ||
    target.startsWith('/') ||
    target.startsWith('~') ||
    URI_SCHEME.test(target) ||
    openers.some((opener) => opener.test(target))
  );
}

/** Everything one rewrite needs across the lines it renders. */
interface RewriteContext {
  readonly diagnostics: Array<LinkDiagnostic>;
  readonly fileDir: string;
  readonly input: RewriteLinksInput;
  readonly openers: ReadonlyArray<RegExp>;
  readonly pattern: RegExp;
}

/** Resolves one link target to the absolute path it deploys at, or to nothing when it stays as written. */
function resolveTarget(target: string, context: RewriteContext, partialId: PartialId | undefined): string | undefined {
  if (namesItsOwnDestination(target, context.openers)) {
    return undefined;
  }

  // Split the fragment off before resolution, since it addresses a position within the file rather than a path.
  const hashIndex = target.indexOf('#');
  const pathPart = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : target.slice(hashIndex);

  const resolved = path.posix.join(context.fileDir, pathPart);
  if (resolved === '..' || resolved.startsWith('../')) {
    context.diagnostics.push(createDiagnostic(target, context, partialId));
    return undefined;
  }

  return `${context.input.targetRoot}/${resolved}${fragment}`;
}

/** Rewrites one line's link targets, replacing each target's own characters and leaving the link around it intact. */
function rewriteLine(line: string, partialId: PartialId | undefined, context: RewriteContext): string {
  let rendered = '';
  let cursor = 0;

  for (const match of line.matchAll(context.pattern)) {
    const span = match.indices?.[1];
    const target = match[1];
    if (span === undefined || target === undefined || span[0] < cursor) {
      continue;
    }
    const resolved = resolveTarget(target, context, partialId);
    rendered += line.slice(cursor, span[0]) + (resolved ?? target);
    cursor = span[1];
  }

  return rendered + line.slice(cursor);
}

/** Matches a leading URI scheme, so `mailto:` and every other scheme is left alone rather than read as a path. */
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

// endregion | Helpers
