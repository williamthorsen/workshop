import { renderContributionMarkers } from '../deployment/contribution-markers.ts';
import type { RegionMarkers } from '../ownership/RegionMarkers.ts';
import { renderContribution } from '../ownership/renderContribution.ts';
import { compareStrings } from '../portable/compareStrings.ts';
import type { ArtifactRender } from '../render/renderArtifact.ts';
import type { ArtifactContribution, FileContributors } from '../schemas/file-schemas.ts';
import type { PartialEntry } from '../schemas/graph-schemas.ts';
import type { InlayStage, LineRewrite, RenderTarget } from '../schemas/render-target-schemas.ts';
import type { ArtifactId, TargetId } from '../schemas/scalar-schemas.ts';
import type { InlayBinding } from '../selection/selectArtifacts.ts';
import type { BindingDiagnostic, BindingFailure, BindingRef } from './BindingDiagnostic.ts';
import { renderInlayMarkers } from './inlay-markers.ts';

/** What filling one target's inlays reads. */
export interface FillInlaysInput {
  readonly target: RenderTarget;
  /** The target's whole column of the render matrix, keyed by artifact. */
  readonly renders: ReadonlyMap<ArtifactId, ArtifactRender>;
  /** What each inlay is filled with, in the order a fill splices them. */
  readonly bindings: ReadonlyArray<InlayBinding>;
  /** The artifacts the closure reached, the only hosts a fill is computed for. */
  readonly reached: ReadonlySet<ArtifactId>;
}

/** The column with every inlay filled, beside what the bindings got wrong. */
export interface InlayFill {
  readonly renders: ReadonlyMap<ArtifactId, ArtifactRender>;
  readonly diagnostics: ReadonlyArray<BindingDiagnostic>;
}

/**
 * Fills every inlay this target's artifacts declared, from the artifacts the config bound to each.
 *
 * Pure and free of target state, which is what lets the validation flow run it for the faults alone while the plan
 * flow runs it for the content. It returns the type it was given, so a caller substitutes the filled column for the
 * one it held and everything downstream reads filled bodies without knowing a fill happened.
 *
 * The splice happens here rather than during capture because a binding is a config's to make: filling at capture would
 * put a toggle on the far side of the render matrix, and the toggle-recompute-replan loop the engine is shaped around
 * would need a recapture per binding change.
 *
 * Sites are spliced from the back, so the indices a render recorded stay addressed to the same lines as earlier sites
 * are filled. Two directives on consecutive lines record one index between them, and splicing in reverse is also what
 * keeps those two blocks in the order the body declared them.
 *
 * A fill reaches one level, and the rule fires on the declaration rather than on the loss: a filler whose body declares
 * an inlay ends the host's render whether or not the config binds anything to that inner name. Gating on the binding
 * instead would let an edit to one inlay's bindings block a file whose body nobody touched, so what an artifact may
 * fill stays a property of the artifact. A filler whose own render ended ends the host's render too, that one for the
 * body it leaves missing. A filler of a kind the target takes none of is neither, being the standing rule that a kind a
 * target declares no deployment for does not deploy there: it contributes nothing and is reported.
 *
 * Each inlay's fillers are read once per target and reused by every host declaring that inlay, so a body reshaped for
 * two hosts is reshaped once and a filler the target cannot deploy is reported once. A fault that blocks is the
 * exception: it is one consequence per host, so each host raises it against itself.
 */
export function fillInlays(input: FillInlaysInput): InlayFill {
  const stage = input.target.stages.find((held) => held.kind === 'inlay');
  if (stage === undefined) {
    return { renders: input.renders, diagnostics: [] };
  }

  const context: FillContext = {
    stage,
    reshape: stage.reshape === undefined ? undefined : compileReshape(stage.reshape),
    bound: new Map(input.bindings.map(({ inlayName, artifactIds }) => [inlayName, artifactIds])),
    diagnostics: [],
    reads: new Map(),
    renders: input.renders,
    targetId: input.target.id,
  };
  const filled = new Map(input.renders);

  for (const [hostId, render] of input.renders) {
    if (input.reached.has(hostId) && render.status === 'rendered' && render.inlays.length > 0) {
      filled.set(hostId, fillHost(context, hostId, render));
    }
  }

  return { renders: filled, diagnostics: context.diagnostics };
}

// region | Helpers

/**
 * The fault that leaves a host with no body worth writing, held apart from the host that will raise it.
 *
 * One read serves every host declaring the inlay, while a block is one consequence per host, so the read states what
 * the fault is and each host names itself when it raises it.
 */
interface BlockingFault {
  readonly code: Extract<BindingFailure, 'nested-inlay' | 'unrenderable-binding'>;
  readonly inlayName: string;
  readonly artifactId: ArtifactId;
  readonly detail: string;
}

/** Builds one filled inlay's whole block, or nothing where the inlay has no filler to put in it. */
function buildBlock(context: FillContext, inlayName: string, fillers: ReadonlyArray<Filler>): string | undefined {
  if (fillers.length === 0) {
    return undefined;
  }

  const contributions = fillers.map((filler) => renderContribution(filler.markers, filler.body));
  return renderContribution(renderInlayMarkers(context.stage.markers, inlayName), contributions.join('\n\n'));
}

/** A reshape rule as the fill runs it. */
interface CompiledReshape {
  readonly pattern: RegExp;
  readonly replacement: string;
}

/**
 * Compiles a declared reshape rule into the expression each line of a filler is rewritten by.
 *
 * The engine supplies the flag, as it does for a link grammar and for the same reason: `g` rewrites every match on a
 * line, and matching runs a line at a time, so a rule whose character classes admit a newline cannot run away from the
 * line it was written for. That the source compiles is `assertRenderTargetsAreConsistent`'s question.
 */
function compileReshape(rewrite: LineRewrite): CompiledReshape {
  return { pattern: new RegExp(rewrite.pattern, 'g'), replacement: rewrite.replacement };
}

/** States one binding fault, opening with the filler at fault where the code names one. */
function describeFault(code: BindingFailure, at: BindingRef, detail: string): BindingDiagnostic {
  const subject = at.artifactId === undefined ? `The binding to inlay "${at.inlayName}"` : `"${at.artifactId}"`;
  return { code, message: `${subject} ${detail}.`, at };
}

/** What filling one target's hosts reads, gathered once for every host that declares an inlay. */
interface FillContext {
  readonly stage: InlayStage;
  readonly reshape: CompiledReshape | undefined;
  /** Keyed by inlay name, each list in the order a fill splices it. */
  readonly bound: ReadonlyMap<string, ReadonlyArray<ArtifactId>>;
  readonly diagnostics: Array<BindingDiagnostic>;
  /** Each inlay's fillers, read once and reused by every host declaring it. */
  readonly reads: Map<string, FillerRead>;
  readonly renders: ReadonlyMap<ArtifactId, ArtifactRender>;
  readonly targetId: TargetId;
}

/** One filler's reshaped body, with what it takes to write and to attribute the block it becomes. */
interface Filler {
  readonly artifactId: ArtifactId;
  readonly body: string;
  readonly markers: RegionMarkers;
  readonly contributors: FileContributors;
  readonly partials: ReadonlyArray<PartialEntry>;
}

/** Every filler one site takes, or the fault that ends the render of every host declaring it. */
type FillerRead =
  | { readonly status: 'read'; readonly fillers: ReadonlyArray<Filler> }
  | { readonly status: 'blocked'; readonly fault: BlockingFault };

/**
 * Fills every inlay one host declared, ending its render where any filler leaves it unwritable.
 *
 * The sites are read forward and spliced backward. Reading forward is what puts the contributors in the order the body
 * declares them; splicing backward is what keeps every unfilled index addressing the line it was recorded against.
 *
 * Every site is read before the host is decided, even once one has blocked it, so a fault does not hide behind an
 * earlier one and a single run reports every mistake a config contains. The render is ended by the first block, in
 * declaration order, a blocked destination taking one reason while the report takes them all.
 *
 * A blocking fault travels twice: as a diagnostic, which is how the report lists it beside the host's other faults, and
 * as the failed render, which is what leaves the host's destinations holding what they hold.
 */
function fillHost(context: FillContext, hostId: ArtifactId, render: RenderedArtifact): ArtifactRender {
  const blocks: Array<{ insertAt: number; block: string | undefined }> = [];
  const used: Array<Filler> = [];
  let blocking: BindingDiagnostic | undefined;

  for (const site of render.inlays) {
    const read = readInlay(context, site.name);
    if (read.status === 'blocked') {
      const { code, inlayName, artifactId, detail } = read.fault;
      const at: BindingRef = { inlayName, targetId: context.targetId, hostArtifactId: hostId, artifactId };
      const diagnostic = describeFault(code, at, detail);
      // The report reads the diagnostics; the plan reads the failed render, which is what blocks the host's file.
      context.diagnostics.push(diagnostic);
      blocking ??= diagnostic;
      continue;
    }
    const block = buildBlock(context, site.name, read.fillers);
    blocks.push({ insertAt: site.insertAt, block });
    if (block !== undefined) {
      used.push(...read.fillers);
    }
  }

  if (blocking !== undefined) {
    return { status: 'failed', failure: { stage: 'binding', diagnostic: blocking } };
  }

  const lines = render.content.split('\n');
  for (const { insertAt, block } of blocks.toReversed()) {
    if (block !== undefined) {
      lines.splice(insertAt, 0, ...block.split('\n'));
    }
  }

  return {
    ...render,
    content: lines.join('\n'),
    contributors: mergeContributors(render.contributors, used),
    partials: mergePartials(render.partials, used),
  };
}

/**
 * Names the host's own contributors alongside every artifact whose body reached it through an inlay.
 *
 * Each filler records the markers its block was written behind, so a reader holding the deployed file can find the
 * bytes each contributor put there. A filler the host already names keeps the entry it had: the host's own attribution
 * of an artifact outranks the one a fill would give it.
 */
function mergeContributors(host: FileContributors, fillers: ReadonlyArray<Filler>): FileContributors {
  const artifacts = new Map<ArtifactId, ArtifactContribution>(
    host.artifacts.map((contribution) => [contribution.artifactId, contribution]),
  );
  const partials = new Set(host.partials);

  for (const filler of fillers) {
    if (!artifacts.has(filler.artifactId)) {
      artifacts.set(filler.artifactId, { artifactId: filler.artifactId, marker: filler.markers });
    }
    for (const partial of filler.contributors.partials) {
      partials.add(partial);
    }
  }

  return { artifacts: artifacts.values().toArray(), partials: [...partials].toSorted(compareStrings) };
}

/** Names the partials whose text reached the host, its own and every filler's, in id order. */
function mergePartials(host: ReadonlyArray<PartialEntry>, fillers: ReadonlyArray<Filler>): Array<PartialEntry> {
  const known = new Map(host.map((partial) => [partial.id, partial]));
  for (const filler of fillers) {
    for (const partial of filler.partials) {
      known.set(partial.id, partial);
    }
  }
  return known
    .values()
    .toArray()
    .toSorted((left, right) => compareStrings(left.id, right.id));
}

/** Reads every filler one inlay is bound to, reporting each the target deploys nowhere and stopping at the first block. */
function readFillers(context: FillContext, inlayName: string): FillerRead {
  const fillers: Array<Filler> = [];
  const boundHere = context.bound.get(inlayName) ?? [];

  for (const artifactId of boundHere) {
    const render = context.renders.get(artifactId);

    if (render === undefined || render.status === 'not-deployed') {
      const at: BindingRef = { inlayName, targetId: context.targetId, artifactId };
      const detail = `is of a kind "${context.targetId}" deploys nowhere, so it fills nothing there`;
      context.diagnostics.push(describeFault('undeployed-kind', at, detail));
      continue;
    }
    if (render.status === 'failed') {
      const detail = `could not be rendered: ${render.failure.diagnostic.message}`;
      return { status: 'blocked', fault: { code: 'unrenderable-binding', inlayName, artifactId, detail } };
    }
    if (render.inlays.length > 0) {
      const detail = 'declares an inlay of its own, which a fill one level deep can never reach';
      return { status: 'blocked', fault: { code: 'nested-inlay', inlayName, artifactId, detail } };
    }

    fillers.push({
      artifactId,
      body: reshapeBody(context.reshape, render.content),
      markers: renderContributionMarkers(context.stage.contributionMarkers, artifactId),
      contributors: render.contributors,
      partials: render.partials,
    });
  }

  return { status: 'read', fillers };
}

/**
 * Reads every filler one inlay is bound to, once per target.
 *
 * Whether a filler deploys at this target, renders at all, or nests an inlay of its own are all properties of the
 * filler and the target, so re-deciding them per host would repeat one verdict and report one fault as many.
 */
function readInlay(context: FillContext, inlayName: string): FillerRead {
  const held = context.reads.get(inlayName);
  if (held !== undefined) {
    return held;
  }

  const read = readFillers(context, inlayName);
  context.reads.set(inlayName, read);
  return read;
}

/** One artifact's completed render, which is the only status a fill has anything to do with. */
type RenderedArtifact = Extract<ArtifactRender, { status: 'rendered' }>;

/** Rewrites each line of a filler's body, so a body written to stand alone sits level with its host. */
function reshapeBody(reshape: CompiledReshape | undefined, body: string): string {
  if (reshape === undefined) {
    return body;
  }
  return (
    body
      .split('\n')
      // eslint-disable-next-line unicorn/no-unsafe-string-replacement -- a reshape's `$1` back-references are the point
      .map((line) => line.replace(reshape.pattern, reshape.replacement))
      .join('\n')
  );
}

// endregion | Helpers
