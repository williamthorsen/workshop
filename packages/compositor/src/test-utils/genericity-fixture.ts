/**
 * A second consumer, declared to falsify the claim that this package's mechanisms are generic.
 *
 * Every mechanism reads its vocabulary from a declaration, and the rest of the suite declares one consumer's: Markdown
 * bodies, `<!-- -->` directives, `{kind:name}` tokens, Markdown links, and skill-shaped layouts. A suite written in one
 * vocabulary can show a mechanism works; it cannot show the mechanism is general. This is the control -- a legal clause
 * library in AsciiDoc, differing from `composition-fixture.ts` in every dimension where a compiled-in assumption could
 * hide. Nothing here is to be normalized toward the vocabulary beside it: folding a declaration back toward Markdown,
 * brace tokens, or a skill-shaped layout destroys what the fixture exists to prove.
 *
 * It shares no declaration and no capture path with `composition-fixture.ts` and `captureComposition.ts`. Reaching the
 * pipeline through those would inherit their defaults, and a default silently inherited is the assumption this fixture
 * exists to have none of.
 *
 * The three kinds are the ones bearing a genericity claim. The guidance fixture's other structural cases -- an
 * aggregate emitting no files, a kind no target deploys -- bear none, and mirroring its structure would make this a
 * translation of that fixture rather than an independent consumer.
 *
 * No frontmatter stage is declared, and `edgeRules` is empty for the same reason. `mergeFrontmatter` emits a
 * `---`-fenced YAML block by construction, and `readFrontmatterEdges` reads its declarations through
 * `parseFrontmatter`, which finds a block only where the content opens with that delimiter. Both mechanisms serve
 * formats carrying such a header, and AsciiDoc is not one. That is where the genericity claim stops, rather than a
 * gap in the coverage of it.
 */

import type { ArtifactRead, EdgeContribution } from '../closure/EdgeContributor.ts';
import type { ResolveKind } from '../schemas/catalog-schemas.ts';
import type { CompositorConfig } from '../schemas/config-schemas.ts';
import type { MarkerPair, RenderTarget } from '../schemas/render-target-schemas.ts';
import type { TokenKind } from '../schemas/token-kind-schemas.ts';
import type { CompositionSnapshot } from '../snapshot/captureSnapshot.ts';
import { captureSnapshot } from '../snapshot/captureSnapshot.ts';
import { extractTokenEdges } from '../tokens/extractTokenEdges.ts';
import { buildConfig } from './buildConfig.ts';
import { buildTempTree } from './buildTempTree.ts';

/** Builds the source tree the fixture composes over. */
export function buildGenericitySourceFiles(): Record<string, string | Uint8Array> {
  return {
    'clauses/governing-law.adoc': '= Governing law\n\nThe laws of the stated jurisdiction govern this agreement.\n',
    'clauses/indemnity.adoc': [
      '= Indemnity',
      '',
      '// include: ../partials/notice.adoc /',
      '',
      'The <<party:Vendor>> shall indemnify the Customer.',
      '',
      'See xref:../exhibits/schedule-of-fees/EXHIBIT.adoc[the fee schedule].',
      '',
    ].join('\n'),
    'definitions/affiliate.adoc':
      'Affiliate: any entity controlling the <<party:Vendor>>, as qualified by <<clause:governing-law>>.\n',
    'exhibits/schedule-of-fees/EXHIBIT.adoc': '= Schedule of fees\n\nFees are stated in the attached rates table.\n',
    'exhibits/schedule-of-fees/rates.pdf': RATES_PDF_BYTES,
    'partials/notice.adoc': 'NOTE: This clause is a standard-form provision.\n',
  };
}

/**
 * Builds the jurisdiction the fixture deploys into: clauses as named files, definitions aggregated into one region.
 *
 * The clause deployment is rooted at `articles` while the source roots the kind at `clauses`, so a layout read from the
 * source rather than from the target's own declaration lands the file in the wrong tree.
 */
export function buildJurisdictionTarget(targetRoot: string): RenderTarget {
  return {
    id: 'de',
    label: 'Germany',
    root: targetRoot,
    tokenMappings: [
      { kindId: 'clause-reference', entries: [], sigil: '§' },
      { kindId: 'party', entries: [{ from: 'Vendor', to: 'Supplier' }] },
    ],
    deployments: [
      {
        form: 'tree',
        kindId: 'clause',
        layout: { form: 'file', root: 'articles', extension: '.adoc' },
        nameTemplate: 'clause-{slug}',
      },
      {
        form: 'region',
        kindId: 'definition',
        host: CONTRACT_HOST_PATH,
        markers: REGION_MARKERS,
        contributionMarkers: CONTRIBUTION_MARKERS,
      },
      { form: 'tree', kindId: 'exhibit', layout: { form: 'directory', root: 'exhibits', entryFile: 'EXHIBIT.adoc' } },
    ],
    stages: [
      { kind: 'transclusion', syntax: { open: '//', close: '' } },
      { kind: 'tokens' },
      { kind: 'links', pattern: String.raw`xref:([^\[]+)\[` },
    ],
  };
}

/**
 * Captures a composition over a temporary source tree and destination root, both removed when the test ends.
 *
 * Only the `indemnity` clause is selected. The other clause is reached through the referent token a definition carries,
 * so a closure that failed to read a token behind this consumer's delimiter would leave it out of the composition.
 */
export async function captureGenericityComposition(): Promise<GenericityFixture> {
  const sourceDir = await buildTempTree(buildGenericitySourceFiles(), 'compositor-clauses');
  const targetRoot = await buildTempTree({ '.keep': '' }, 'compositor-jurisdiction');

  const config = buildConfig([
    {
      id: 'firm',
      sources: { use: [{ name: 'firm', path: sourceDir }] },
      select: {
        clause: { use: ['indemnity'] },
        definition: { use: [{ source: 'firm' }] },
        exhibit: { use: [{ source: 'firm' }] },
      },
    },
  ]);

  const snapshot = await captureSnapshot({
    config,
    baseDir: targetRoot,
    kinds: GENERICITY_KINDS,
    targets: [buildJurisdictionTarget(targetRoot)],
    tokenKinds: GENERICITY_TOKEN_KINDS,
    edgeRules: [],
    kindKeys: {},
    contributeEdges: contributeTokenEdges,
    contentKeyPath: ['contracts', 'content'],
  });

  return { config, snapshot, sourceDir, targetRoot };
}

/** The path of the host the fixture's definitions aggregate into. */
export const CONTRACT_HOST_PATH = 'master-agreement.adoc';

/** The markers delimiting one contributor's block within the fixture's host, in AsciiDoc's tagged-region syntax. */
export const CONTRIBUTION_MARKERS: MarkerPair = {
  open: '// tag::{artifactId}[]',
  close: '// end::{artifactId}[]',
};

/**
 * The kinds the fixture is written against, each bearing a claim that a mechanism reads its vocabulary declaratively.
 *
 * `clause` is one file per artifact and deploys under a name template; `definition` routes into a shared host; and
 * `exhibit` is a directory per artifact, so it ships an asset beside the entry file carrying its body.
 */
export const GENERICITY_KINDS: ReadonlyArray<ResolveKind> = [
  {
    id: 'clause',
    label: 'Clause',
    emitsFiles: true,
    layout: { form: 'file', root: 'clauses', extension: '.adoc' },
  },
  {
    id: 'definition',
    label: 'Definition',
    emitsFiles: true,
    layout: { form: 'file', root: 'definitions', extension: '.adoc' },
  },
  {
    id: 'exhibit',
    label: 'Exhibit',
    emitsFiles: true,
    layout: { form: 'directory', root: 'exhibits', entryFile: 'EXHIBIT.adoc' },
  },
];

/**
 * The token kinds the fixture declares, in both forms and neither brace-delimited.
 *
 * `clause-reference` resolves to the name its clause deploys under, and `party` resolves through the target's own
 * mapping table.
 */
export const GENERICITY_TOKEN_KINDS: ReadonlyArray<TokenKind> = [
  {
    id: 'clause-reference',
    label: 'Clause reference',
    form: 'referent',
    pattern: '<<clause:([a-z][a-z0-9-]*)>>',
    artifactKindId: 'clause',
  },
  { id: 'party', label: 'Party', form: 'mapping', pattern: String.raw`<<party:(\w+)>>` },
];

/** A captured composition, with the config it answers and the directories it was captured over. */
export interface GenericityFixture {
  readonly config: CompositorConfig;
  readonly snapshot: CompositionSnapshot;
  readonly sourceDir: string;
  readonly targetRoot: string;
}

/** A PDF signature, standing in for an asset an exhibit ships and no target transforms. */
export const RATES_PDF_BYTES = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

/** The markers fencing the span the engine owns within the fixture's host. */
export const REGION_MARKERS: MarkerPair = {
  open: '// tag::contract-engine[]',
  close: '// end::contract-engine[]',
};

// region | Helpers

/**
 * Contributes the closure edges an artifact's own body declares through its referent tokens.
 *
 * The body is read as written rather than expanded first: what carries a genericity claim is the declared pattern, not
 * the attribution of an edge to the partial it arrived through.
 */
function contributeTokenEdges(read: ArtifactRead): EdgeContribution {
  return { edges: extractTokenEdges([{ lines: read.content.split('\n') }], GENERICITY_TOKEN_KINDS), partials: [] };
}

// endregion | Helpers
