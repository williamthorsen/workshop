import { composeArtifactId } from '../resolution/composeArtifactId.ts';
import type { ArtifactId, PartialId, TargetId } from '../schemas/scalar-schemas.ts';
import type { TargetEntry } from '../schemas/target-schemas.ts';
import type { TokenKind } from '../schemas/token-kind-schemas.ts';
import type { Segment } from '../transclusion/expandTransclusions.ts';
import { compileTokenPattern } from './compileTokenPattern.ts';
import type { TokenDiagnostic, TokenFailure, TokenRef } from './TokenDiagnostic.ts';

/** Resolves the name an artifact deploys under for one target, or nothing when it does not deploy there. */
export type DeployedNameLookup = (targetId: TargetId, artifactId: ArtifactId) => string | undefined;

/** Everything rendering one artifact's body for one target needs. */
export interface RewriteTokensInput {
  readonly segments: ReadonlyArray<Segment>;
  readonly tokenKinds: ReadonlyArray<TokenKind>;
  readonly target: TargetEntry;
  /** Names the artifact in a diagnostic, so an author sees which body to fix. */
  readonly host: ArtifactId;
  readonly resolveDeployedName: DeployedNameLookup;
}

/** A rendered body, with every token the target could not render. */
export interface TokenRewrite {
  readonly segments: ReadonlyArray<Segment>;
  readonly diagnostics: ReadonlyArray<TokenDiagnostic>;
}

/**
 * Renders every declared token in `segments` for one target, keeping each segment's attribution.
 *
 * A token the target cannot render stays in the body verbatim and comes back as a diagnostic, so a plan can record the
 * file it would have written beside the reason it will not.
 *
 * Deployed names are resolved through an injected lookup rather than read from any rendered body, which is what keeps
 * name resolution and rewriting from depending on each other.
 */
export function rewriteTokens(input: RewriteTokensInput): TokenRewrite {
  const context: RewriteContext = {
    diagnostics: [],
    input,
    kinds: input.tokenKinds.map((kind) => ({ kind, pattern: compileTokenPattern(kind) })),
  };

  const segments = input.segments.map((segment) => {
    const lines = segment.lines.map((line) => rewriteLine(line, segment.partialId, context));
    return segment.partialId === undefined ? { lines } : { lines, partialId: segment.partialId };
  });

  return { segments, diagnostics: context.diagnostics };
}

// region | Helpers

/**
 * Collects every token any declared kind matches in `line`, ordered by position.
 *
 * Sorting is stable, so two kinds matching at one position resolve in the order they were declared. Gathering every
 * match before rewriting any of them is what keeps one kind from matching text another kind just produced.
 */
function collectMatches(line: string, kinds: ReadonlyArray<CompiledKind>): Array<TokenMatch> {
  const matches: Array<TokenMatch> = [];
  for (const { kind, pattern } of kinds) {
    for (const match of line.matchAll(pattern)) {
      const name = match[1];
      if (name !== undefined) {
        matches.push({ index: match.index, kind, name, token: match[0] });
      }
    }
  }
  return matches.toSorted((left, right) => left.index - right.index);
}

/** One declared kind with the expression both token surfaces match it by. */
interface CompiledKind {
  readonly kind: TokenKind;
  readonly pattern: RegExp;
}

/** Builds the diagnostic for a token that would not resolve, omitting the partial when there is none. */
function createDiagnostic(
  failure: { readonly failure: TokenFailure; readonly detail: string },
  match: TokenMatch,
  host: ArtifactId,
  partialId: PartialId | undefined,
): TokenDiagnostic {
  const at: TokenRef = partialId === undefined ? { host, token: match.token } : { host, token: match.token, partialId };
  return { code: failure.failure, message: `The token ${match.token} in ${host} ${failure.detail}.`, at };
}

/** Resolves one token to the text it renders as, or to the reason it cannot render. */
function resolveToken(match: TokenMatch, input: RewriteTokensInput): TokenResolution {
  const mapping = input.target.tokenMappings.find((entry) => entry.kindId === match.kind.id);
  const sigil = mapping?.sigil ?? '';

  if (match.kind.form === 'mapping') {
    const mapped = mapping?.entries.find((entry) => entry.from === match.name);
    if (mapped === undefined) {
      return { failure: 'unmapped-name', detail: `names "${match.name}", which ${input.target.label} does not map` };
    }
    return { rendered: `${sigil}${mapped.to}` };
  }

  const artifactId = composeArtifactId(match.kind.artifactKindId, match.name);
  const deployed = input.resolveDeployedName(input.target.id, artifactId);
  if (deployed === undefined) {
    const detail = `names "${match.name}", which does not deploy to ${input.target.label}`;
    return { failure: 'undeployed-referent', detail };
  }
  return { rendered: `${sigil}${deployed}` };
}

/** Everything one rewrite needs across the lines it renders. */
interface RewriteContext {
  readonly diagnostics: Array<TokenDiagnostic>;
  readonly input: RewriteTokensInput;
  readonly kinds: ReadonlyArray<CompiledKind>;
}

/** Rewrites one line's tokens, skipping any match a preceding one already consumed. */
function rewriteLine(line: string, partialId: PartialId | undefined, context: RewriteContext): string {
  let rendered = '';
  let cursor = 0;

  for (const match of collectMatches(line, context.kinds)) {
    if (match.index < cursor) {
      continue;
    }
    const resolution = resolveToken(match, context.input);
    if ('failure' in resolution) {
      context.diagnostics.push(createDiagnostic(resolution, match, context.input.host, partialId));
    }
    const replacement = 'rendered' in resolution ? resolution.rendered : match.token;
    rendered += line.slice(cursor, match.index) + replacement;
    cursor = match.index + match.token.length;
  }

  return rendered + line.slice(cursor);
}

/** One token found in a line, with the kind that matched it and the name it captured. */
interface TokenMatch {
  readonly index: number;
  readonly kind: TokenKind;
  readonly name: string;
  readonly token: string;
}

/** What a token renders as, or why it cannot render. */
type TokenResolution = { readonly rendered: string } | { readonly failure: TokenFailure; readonly detail: string };

// endregion | Helpers
