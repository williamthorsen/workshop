import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { parseFrontmatter } from '../frontmatter/parseFrontmatter.ts';
import { composeArtifactId } from '../resolution/composeArtifactId.ts';
import type { ClosureDiagnostic } from '../schemas/closure-schemas.ts';
import type { EdgeRule, KindKeys } from '../schemas/edge-rule-schemas.ts';
import type { DependencyEdge } from '../schemas/graph-schemas.ts';
import type { ArtifactId } from '../schemas/scalar-schemas.ts';

/** The rules one kind's artifacts are read by, beside the keys that belong to some other kind's rules. */
export interface KindEdgeRules {
  readonly rules: ReadonlyArray<EdgeRule>;
  readonly foreignKeys: ReadonlySet<string>;
}

/** What one artifact's frontmatter declared, and the faults met reading it. */
export interface FrontmatterEdges {
  readonly edges: ReadonlyArray<DependencyEdge>;
  readonly diagnostics: ReadonlyArray<ClosureDiagnostic>;
}

/** What reading one artifact's declared edges takes. */
export interface FrontmatterEdgesInput {
  readonly artifactId: ArtifactId;
  readonly content: string;
  readonly kindKeys: KindKeys;
  readonly kindRules: KindEdgeRules;
  /** Called only when a wildcard token is met, so a rule admitting one costs nothing until an artifact writes it. */
  readonly expand: () => ReadonlyArray<ArtifactId>;
}

/**
 * Reads the edges one artifact's frontmatter declares, under the rules its kind is governed by.
 *
 * A content fault is a diagnostic rather than a throw, so one run reports every mistake in a source tree and a reader
 * attaches each to the file an author wrote. What a rule cannot make sense of contributes no edge, which keeps a
 * malformed block from silently becoming a smaller closure with nothing to say why.
 *
 * An artifact carrying no frontmatter declares nothing, and neither does a block that parses to something other than a
 * mapping: a block is metadata, and a document whose metadata is a list has declared no keys rather than bad ones. A
 * block opened and never closed is a fault, because an author who opened one meant to declare something.
 *
 * Edges run in rule order, then in the order the block lists them, and repeat only when they differ in origin: one
 * artifact named twice under one key is one edge, while a slug both declared and enumerated is two facts.
 */
export function readFrontmatterEdges(input: FrontmatterEdgesInput): FrontmatterEdges {
  const { artifactId, content, kindKeys, kindRules, expand } = input;
  const edges: Array<DependencyEdge> = [];
  const diagnostics: Array<ClosureDiagnostic> = [];
  const fault = createFault(artifactId, diagnostics);

  const block = parseFrontmatter(content);
  if (block.frontmatter === undefined) {
    if (block.isUnterminated) {
      fault('invalid-declaration', undefined, 'opens a frontmatter block that no delimiter closes');
    }
    return { edges, diagnostics };
  }

  const declaration = parseBlock(block.frontmatter);
  if (declaration === undefined) {
    fault('invalid-declaration', undefined, 'has a frontmatter block that is not valid YAML');
    return { edges, diagnostics };
  }
  if (!isRecord(declaration)) {
    return { edges, diagnostics };
  }

  for (const rule of kindRules.rules) {
    const value = readOwn(declaration, rule.key);
    if (value === undefined || value === null) {
      continue;
    }
    edges.push(...readRule(rule, value, { kindKeys, expand, fault }));
  }

  for (const key of Object.keys(declaration)) {
    if (kindRules.foreignKeys.has(key)) {
      fault('misplaced-key', key, 'belongs to another kind, so nothing here reads it as an edge');
    }
  }

  return { edges: dedupeEdges(edges), diagnostics };
}

// region | Helpers

/** One slug list as an author may write it: bare slugs, or objects naming one, with any other keys tolerated. */
const SlugListSchema = z
  .array(z.union([z.string().min(1), z.object({ name: z.string().min(1) }).loose()]))
  .transform((entries) => entries.map((entry) => (typeof entry === 'string' ? entry : entry.name)));

/** What reading one rule's value needs beyond the value itself. */
interface RuleContext {
  readonly kindKeys: KindKeys;
  readonly expand: () => ReadonlyArray<ArtifactId>;
  readonly fault: Fault;
}

/** Records one fault against the artifact being read. */
type Fault = (code: ClosureDiagnostic['code'], key: string | undefined, message: string) => void;

/**
 * Creates a recorder appending to `diagnostics`, so each caller states the fault and not where it belongs.
 *
 * A key-scoped fault reads as a sentence about that key, since every such message is a predicate on the key rather than
 * on the artifact carrying it.
 */
function createFault(artifactId: ArtifactId, diagnostics: Array<ClosureDiagnostic>): Fault {
  return (code, key, message) => {
    if (key === undefined) {
      diagnostics.push({ code, message: `${artifactId} ${message}.`, at: { artifactId } });
      return;
    }
    diagnostics.push({ code, message: `${artifactId}: "${key}" ${message}.`, at: { artifactId, key } });
  };
}

/** Drops each edge a later one repeats exactly, one slug named twice under one key being one fact. */
function dedupeEdges(edges: ReadonlyArray<DependencyEdge>): Array<DependencyEdge> {
  const seen = new Set<string>();
  const deduped: Array<DependencyEdge> = [];
  for (const edge of edges) {
    const key = JSON.stringify([edge.to, edge.via, edge.partialId]);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(edge);
    }
  }
  return deduped;
}

/** Reports whether `value` is a mapping, the only shape a declaration block or a kind-keyed value may take. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses one frontmatter block, or reports nothing when it is not valid YAML. */
function parseBlock(block: string): unknown {
  try {
    const parsed: unknown = parseYaml(block);
    // An empty block parses to null, which declares nothing rather than failing to parse.
    return parsed ?? {};
  } catch {
    return undefined;
  }
}

/**
 * Reads `key` from `record`, or reports nothing when the record does not carry it itself.
 *
 * Both records read here are keyed by strings someone else wrote, and a plain object answers `constructor`, `toString`,
 * and every other inherited member with something that is not a declaration.
 */
function readOwn<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** Reads the edges one rule's value declares. */
function readRule(rule: EdgeRule, value: unknown, context: RuleContext): Array<DependencyEdge> {
  if (rule.form === 'flat') {
    return readSlugs(value, rule.key, rule.targetKindId, context).map((to) => ({ to, via: rule.via }));
  }

  if (typeof value === 'string') {
    if (rule.wildcard !== undefined && value === rule.wildcard.token) {
      const { via } = rule.wildcard;
      return context.expand().map((to) => ({ to, via }));
    }
    context.fault('invalid-declaration', rule.key, `holds "${value}", which is not a token it recognizes`);
    return [];
  }

  if (!isRecord(value)) {
    context.fault('invalid-declaration', rule.key, 'holds neither a mapping of kind to slugs nor a known token');
    return [];
  }

  const edges: Array<DependencyEdge> = [];
  for (const [declarationKey, slugs] of Object.entries(value)) {
    if (slugs === undefined || slugs === null) {
      continue;
    }
    const at = `${rule.key}.${declarationKey}`;
    const targetKindId = readOwn(context.kindKeys, declarationKey);
    if (targetKindId === undefined) {
      context.fault('invalid-declaration', at, 'names no kind, so its slugs name nothing');
      continue;
    }
    edges.push(...readSlugs(slugs, at, targetKindId, context).map((to) => ({ to, via: rule.via })));
  }
  return edges;
}

/** Reads one slug list into the ids of `targetKindId`, faulting a value that is not one. */
function readSlugs(value: unknown, at: string, targetKindId: string, context: RuleContext): Array<ArtifactId> {
  const parsed = SlugListSchema.safeParse(value);
  if (!parsed.success) {
    context.fault('invalid-declaration', at, 'holds something other than a list of slugs');
    return [];
  }
  return parsed.data.map((slug) => composeArtifactId(targetKindId, slug));
}

// endregion | Helpers
