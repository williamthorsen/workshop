import type { DirectiveSyntax } from '../schemas/render-target-schemas.ts';
import { buildInlayPatterns } from './buildInlayPatterns.ts';
import type { InlayDiagnostic, InlayFailure } from './InlayDiagnostic.ts';

/** Which inlay a body declares, and where a fill for it is spliced in. */
export interface InlaySite {
  readonly name: string;
  /** Zero-based index into the stripped content's lines, addressing the line the directive occupied. */
  readonly insertAt: number;
}

/** A body with its inlay directives removed, or the directive that stopped the render. */
export type InlayStrip =
  | { readonly status: 'stripped'; readonly content: string; readonly sites: ReadonlyArray<InlaySite> }
  | { readonly status: 'failed'; readonly diagnostic: InlayDiagnostic };

/**
 * Removes every inlay directive `content` declares, reporting where each one stood.
 *
 * A site's `insertAt` addresses the returned content rather than the input, so splicing a fill at that index puts it
 * exactly where its directive was. Content declaring no inlay comes back byte-identical.
 *
 * A line shaped like a directive that names no single inlay ends the render rather than deploying as text, which is
 * the bargain `anyInlay` exists for. So does a body declaring one inlay twice, a fill having no way to choose between
 * two places to go.
 */
export function stripInlays(content: string, syntax: DirectiveSyntax): InlayStrip {
  const patterns = buildInlayPatterns(syntax);
  const kept: Array<string> = [];
  const sites: Array<InlaySite> = [];
  const declared = new Set<string>();

  for (const [index, line] of content.split('\n').entries()) {
    const name = patterns.inlay.exec(line)?.[1];

    if (name === undefined) {
      if (patterns.anyInlay.test(line)) {
        const detail = `names no single inlay: "${line.trim()}"`;
        return { status: 'failed', diagnostic: buildDiagnostic('unrecognized-parameter', detail, index + 1) };
      }
      kept.push(line);
      continue;
    }

    if (declared.has(name)) {
      const detail = `declares "${name}", which this body declares already`;
      return { status: 'failed', diagnostic: buildDiagnostic('duplicate-name', detail, index + 1) };
    }

    declared.add(name);
    sites.push({ name, insertAt: kept.length });
  }

  return { status: 'stripped', content: kept.join('\n'), sites };
}

// region | Helpers

/** Builds the diagnostic naming what the directive on `line` could not do. */
function buildDiagnostic(code: InlayFailure, detail: string, line: number): InlayDiagnostic {
  return { code, message: `The inlay directive at line ${line} ${detail}.`, line };
}

// endregion | Helpers
