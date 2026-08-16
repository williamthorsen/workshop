# @williamthorsen/compositor

Content-agnostic engine that resolves declaratively opted-in content across precedence-ordered sources, computes the transitive dependency closure, and plans idempotent writes to per-target destinations.

Private and unreleased: the name is provisional. What ships today is the plan schema, the contract the engine's output satisfies, and the flows built against it: the config model, source resolution, selection, the dependency closure, the mechanisms that own part of a destination and overlay a target's metadata, the per-target transform pipeline that renders one artifact's content, the snapshot that gathers all of it, the composition that turns a snapshot into a plan, the apply that writes one to a destination, and the validation that reports what a config and its content get wrong. Two mechanisms have no flow routing content to them yet: entries ownership, and the inlay a body declares. The requirements it is built to are tracked in [issue #158](https://github.com/williamthorsen/workshop/issues/158).

Content-agnostic is a testable claim, and `src/__tests__/genericity.unit.test.ts` is where it is tested: it composes and applies a second consumer whose content format, comment syntax, token delimiter, link grammar, and deployed layout all differ from the vocabulary the rest of the suite is written in.

## Config

A config is a list of tiers, lowest precedence first, the order a fold applies them. Each tier declares the sources it adds or drops, and per artifact kind the artifacts it uses or drops. `loadConfig` reads one file per tier, but files are one way to obtain a config rather than the only one: what it returns is the same shape a caller can build in memory and hand straight to the flows downstream, which is what lets an edited config be evaluated without touching disk.

Tier identity -- an id, a label, and the directory a relative path resolves against -- is the consumer's to supply. A file does not know which tier it is; that follows from where the consumer looked for it, which is what keeps any particular project layout out of the package. A tier whose file is absent contributes nothing, while one whose file is present and empty contributes a tier declaring nothing, so an absent tier stays distinguishable from a silent one.

Parsing normalizes: a bare slug becomes an entry, `path` or `package` becomes a source origin, and a kind-keyed mapping becomes an array ordered by kind. Every schema also accepts its own output, so a config already parsed can be modified and re-parsed without being converted back first. These schemas therefore carry transforms and do not render to JSON Schema, unlike the plan and catalog contracts; config is authored input rather than an emitted payload, which is also why it carries no version.

Sources and packages are one declaration list: a package is a source whose location is a package name, which the plan schema's source origin already allows. `resolveSources` folds the tiers into the ordered list resolution reads, locating each package by walking the `node_modules` chain from the tier that declared it and reading the content directory that package declares under a key the consumer names. Precedence runs higher tier first, and author order within a tier, so a config reads with precedence descending down the page. The names a tier dropped and no higher tier re-adopted come back beside the sources, which is what distinguishes a source a consumer turned down from one it never mentioned.

Those are two halves, and a caller planning more than once wants them apart. `locateSourcePackages` reads disk and `foldSourceTiers` is pure and synchronous, so only the fold runs again when a config changes: a config edited in memory can add, remap, rename, reorder, and drop sources against packages located once, since a path resolves against the tier that declared it by arithmetic alone and a package's directory is the only thing here that disk decides. **Locating gathers and folding decides.** Every package any tier declares is walked, including one a later tier drops, and each walk's outcome travels as data rather than as a throw -- which is both what keeps a dropped package that is not installed from failing a config nothing adopts, and what lets a re-adopted source resolve with no second walk. The fold raises what it adopts and cannot resolve: a failed walk's own reason, or, for a package no location answers at all, a stale-snapshot error that only a config naming one the walk never saw can produce.

## Resolution

`resolveCatalog` takes the sources to search, highest precedence first, and the artifact kinds in play. It returns a catalog: every artifact any source carries, each with the source that won it and the sources that lost.

Precedence is the order of the `sources` array and nothing else. A bundled library holds no special status; it shadows nothing by being declared last. A source is a directory, and a kind declares how that directory holds its artifacts: one file per artifact, or one directory per artifact holding an entry file at a fixed name. Nothing about a kind is compiled in, so the engine names no vocabulary of its own.

Resolution enumerates rather than probing for a named slug. Probing can answer "where does this one artifact come from" and nothing else; enumerating also answers "what could I select" and "what did this source lose", which is what a reader offering an a-la-carte choice needs. It reads no configuration and computes no closure: a catalog states what exists, and selecting from it is a separate step that needs no second pass over the filesystem.

Each candidate's digest covers everything its artifact ships, so an artifact whose asset changed beside an untouched entry file still reports as changed. Two sources carrying byte-identical copies produce equal digests, which distinguishes shadowing a stale copy from shadowing the same one. Names beginning with a dot or an underscore are support content and never artifacts.

An entry's id composes its kind and slug, the same way a plan names the artifact it deploys, so a plan entry addresses its catalog entry. Ids stay opaque on the read side: a slug carrying the separator makes splitting one back apart wrong.

`assertCatalogIsConsistent` is to a catalog what `assertPlanIsConsistent` is to a plan, and for the same reason: the schema is purely structural, so id references, entry-id composition, and shadowed-candidate ordering are checked outside it. A catalog `resolveCatalog` produced satisfies all of it by construction, so resolution does not pay for the checks; call the assertion on a catalog that arrived as data. Both assertions throw a subclass of `ConsistencyError`, which is exported so that a reader validating a plan and a catalog together catches one type rather than naming each.

No sample catalogs ship. The plan schema needed them because no engine existed to produce a plan; a catalog comes from calling the resolver.

## Selection

`selectArtifacts` folds a config against a catalog and answers which artifacts were asked for. It is pure: the catalog is the only view of the filesystem, so re-running it over a changed config reads nothing, which is what makes a toggle-and-recompute loop free.

An entry names one artifact or takes everything a source carries, and either form is valid in `use` and in `drop`, so "all of this source except that one" is expressible. Taking a source whole selects the artifacts that source carries, including those a higher-precedence source shadows: shadowing settles which copy an artifact resolves from, and selection settles which artifacts are in play. Indexing winners alone would make a source's contribution shrink as higher-precedence sources were declared above it.

Seeds and declines stay disjoint per artifact. A `drop` clears the seeds beneath it and records the tier that dropped it; a later `use` clears the decline and seeds afresh. What survives to the end is what decided the final state, which is what tells a project-level opt-in from an inherited one, and it is recorded in the plan schema's own seed shape rather than a parallel one.

A selection is a plain value, not a versioned document like a catalog. A document earns its cost when re-deriving the payload is expensive or impossible; a selection is a cheap pure function of two documents that already exist, so nothing can hold one it cannot recompute. A declined artifact has no plan representation yet -- `removed` means deployed and no longer selected, which is a different fact.

A selector matching nothing yields a diagnostic naming the tier, kind, list, and position that produced it, rather than throwing, so validation reports every mistake in a config at once and a reader can attach each to the line an author wrote. A block naming a kind the catalog does not carry faults the whole block, so its diagnostic names the tier and kind alone.

## Closure

A selection says which artifacts were asked for; a closure says which artifacts that implies. `buildEdgeGraph` reads the edges and `computeClosure` walks them, and the split between the two is the whole design: reading touches every file the catalog names once, walking touches none, so a reader toggling a selection recomputes as often as it likes for free.

Edges are declared rather than compiled in. A rule names the kind whose artifacts carry a frontmatter key, the key itself, and the origin its slugs are recorded under. A kind-keyed rule reads a mapping of declaration key to slug list, with a shared map bridging those keys to kinds; a flat rule reads a bare list naming one kind. A rule may admit a wildcard token standing for everything the declaring artifact's own source carries. Nothing in any of it names a skill, a collection, or a dependency: the engine's vocabulary is kinds, keys, and origins.

A rule cannot claim the token origin, a token edge coming from a body rather than a key. Those arrive through the contributor `buildEdgeGraph` calls once per artifact, handed the identity, source, entry path, and the content already read. It is the one place the closure takes code rather than data, because a body's edges are found by expanding and matching it rather than by looking a key up, and it hands back the partials its edges came from so a token traces to the file an author wrote it in. A contributed token naming its own artifact is dropped: it renders per target but is not a dependency, and keeping it would report every self-naming artifact as a cycle. A self-dependency written in frontmatter is kept, an author who wrote one having said something the cycle diagnostic answers.

The wildcard expands during the read, because what a source carries cannot move when a config changes. It names the emitting artifacts of the source that won the declaring artifact, never the artifact itself and never another aggregate: a kind that emits no files exists to be walked through, and "everything, including every aggregate of everything" is a question no consumer means to ask. It does name an artifact a higher-precedence source shadows, on the same reasoning selection applies to a source taken whole.

Aggregates stay in the closure after expansion, where the code this ports from dropped them once their members were reached. `emitsFiles: false` is what keeps one out of the output, so nothing needs dropping, and keeping it is what lets a reader see the route by which a member arrived rather than an unexplained membership.

Faults are data. A cycle names the artifacts it runs through and the walk turns back, so the closure is complete apart from what the cycle hid and no caller waits on a walk that will not end. An edge naming an artifact no source carries is reported and dropped, which is what keeps every surviving edge pointing at something the closure holds. A key another kind's rule owns is reported rather than read by nothing at all. A fault in the rules a consumer wrote throws instead, having no artifact to belong to, as does an entry file that cannot be read: a permissions fault is not an authoring mistake, and treating it as an absence would quietly drop every edge that artifact declared.

A closure is its own versioned document, as a catalog is and a selection is not, because re-deriving one costs a pass over every file a catalog names. It carries the partials its token edges name, so a serialized closure resolves its own references, and it carries neither a kind's on-disk layout nor a source's resolved directory: neither means anything to a reader of a closure, and a local filesystem path has no business travelling inside a payload.

`assertClosureIsConsistent` is to a closure what `assertPlanIsConsistent` is to a plan, and shares most of its checks: the reference and partial-placement rules read the artifact graph both documents carry rather than either document itself. A closure `computeClosure` produced satisfies all of it by construction, so the walk does not pay for the checks; call the assertion on a closure that arrived as data.

## Destination ownership

A destination is not always the engine's to write whole. A guidance file a user also edits, a config another tool also writes: the engine owns part of it and has to leave the rest exactly as it found it. Two mechanisms cover that.

**A region** is a contiguous fenced span. `classifyRegion` reports whether a host holds no markers, one well-formed region, or something no transform may touch, and every other function is defined in terms of it. That indirection is the safety property: the region pattern is lazy, so on a host carrying a stray marker above a well-formed region it matches from the stray marker through the region's close marker, and replacing that span would discard every line between them. Markers are supplied rather than compiled in, matching ignores the indentation a host imposes on them, and injection writes the declared markers back verbatim, so a formatter that re-indented a region does not make it unfindable. Several artifacts aggregate into one region behind their own inner markers: `renderContribution` writes one, and `readContributions` reads back which contributions a host currently carries, taking marker patterns as regular-expression sources so that the question can be asked of a host rather than only confirmed against a list.

**Entries** are individual items of a collection inside a parsed document, interleaved with items other tools wrote. A consumer declares the format, the path to the collection, and the sentinel marking an item as the engine's -- a key path and a value, never a predicate, so the declaration survives being written down. `ensureOwnedItems` replaces the owned subset wholesale: spliced in at the first owned position, appended when the collection owns none, other owned items dropped, foreign items keeping their relative order. That one rule is what makes a re-run a no-op, replaces a drifted item in place, collapses accidental duplicates, and leaves foreign items alone. Every item written is stamped with the sentinel, so an item the engine could not find again is unconstructable rather than refused. Removal prunes the structure it empties, while a collection still holding foreign items survives with those alone.

**Which mechanism applies follows from the ownership, not from the host's format.** A fence needs a comment syntax and a contiguous span; a sentinel needs a host schema that tolerates an extra key. JSON carries no comments, so a JSON host must sentinel. A host whose schema rejects unknown keys can only fence. Interleaved ownership cannot be fenced at all, no span containing it.

What a consumer trades is durability against intrusion. A fence dies the moment another tool re-serializes the host and drops its comments, and the engine then sees no region and writes a second one beside the orphaned first. A sentinel survives that, at the cost of putting a key into a document whose owner did not ask for one.

So a structured host is not automatically parsed. A YAML file whose engine-owned items are contiguous is served by a comment fence over text, and reading it through a parser instead buys nothing while costing formatting fidelity.

Every mechanism is a pure string transform: text in, text out, with parsing and serialization internal, so a target composes them without adapting between two document models. Refusals travel as `OwnershipOutcome`, whose blocked side is the plan's own `FileBlock`: a damaged marker set, a host that will not parse, and a foreign value where a collection was declared are all facts about the destination, and a plan records the intent and the refusal side by side. A fault in the declaration a consumer wrote throws instead, having no plan entry to belong to. Content needing no change comes back untouched rather than re-serialized, which is what makes a re-run byte-identical: re-emitting a parsed document reproduces its comments but not necessarily every formatting choice.

## Frontmatter overlay

A target overlays metadata onto the artifacts it renders: defaults for every artifact, and overrides for one, keyed by slug. The two are separate fields rather than a reserved key beside the slugs, which keeps an artifact from being unaddressable because its slug named the bucket.

`mergeFrontmatter` parses the block and re-emits it rather than rewriting lines. That is what lets an override target a block sequence: a line-based merge can only replace a value sitting on its key's own line, so it orphans the indented lines beneath one, and avoiding that by requiring flow sequences is not a constraint an engine can put on consumer-supplied data. Re-emitting also keeps the comments and formatting of every key the overlay does not touch. Keys already declared keep their position, new keys append sorted, and the body is preserved verbatim.

Nothing is read out of the block. The slug an overlay is keyed by belongs to the caller, which already knows which artifact it is rendering; recovering it from a `name:` field would make the merge depend on one consumer's vocabulary.

## Where a target deploys

A `RenderTarget` is the plan's target entry plus the two things rendering needs and a reader of a plan does not: where each artifact kind lands, and which transforms run. Neither reaches the payload, on the reasoning that makes a token kind engine input while the plan carries only its descriptor.

A deployment takes one of two forms, which are the two ways a destination can hold a kind. **A tree deployment** names a layout and optionally the template its deployed name renders from. The layout vocabulary is the one resolution already uses to describe how a source holds a kind, because a destination holds a kind the same two ways: one file per artifact, or a directory per artifact with an entry file at a fixed name. What differs is only what names the artifact -- its slug in a source, the name it deploys under in a destination -- and that is what the template supplies, `{slug}` being the one placeholder the engine owns. A layout rooted at the empty string puts its kind at the destination root, which is how a destination that keeps one guidance file beside its directories is expressed.

**A region deployment** routes every artifact of its kind into one host file the engine does not otherwise own, and names the host, the markers fencing the span it owns there, and the template each contribution's own markers render from. The template's placeholder is the artifact id rather than the slug, because two kinds may aggregate into one host and only the id carries the kind that tells their contributions apart. One template serves both directions: `renderContributionMarkers` writes a contribution's markers and `buildContributionPatterns` derives the patterns a host is read back through, so a host is read through exactly what was written into it rather than through a second declaration that could drift from the first.

Neither form's declaration is trusted on faith. `assertRenderTargetsAreConsistent` reports markers that could not delimit a span, a contribution template that does not name its contributor exactly once, a host standing where a layout root's directory goes, and a name template rendering names no scan of the destination could claim back -- a template standing no placeholder, or one whose literal head reads as support content. Each is reported before it could surface at whichever file first reached the fault, and the last of them before it could deploy files that are never diffed and never removed. A host whose _shape_ a layout's claim rule could match is a different question, decidable only against the slugs a catalog turns out to carry, and it belongs to the scan that reads current target state rather than here.

**A kind the target declares no deployment for does not deploy there.** That single rule answers the deployability question a token naming an artifact has to pass before it can render, and `resolveDeployedNames` answers it for every artifact and target at once, before anything is rendered. It has to run first: a referent token renders the name its artifact deploys under, so resolving names during the rewrite would make each wait on the other. A region-routed artifact answers with its host path, so a token naming one renders the file a reader would open to find it, and a link written inside it resolves against that file; its own declared name does not apply, an artifact aggregated into a host having no name of its own to override. Whether one artifact of a deployed kind suppresses its own deployment is a fact that artifact declares, and nothing reads artifact declarations yet; the deployed name an artifact declares for itself arrives as an input to the pass for the same reason. Two artifacts resolving to one name is a question about a set, and belongs to validate.

## The transform pipeline

A target declares which stages run and with what parameters. It does not declare their sequence, which is the engine's, and every ordering the engine fixes is load-bearing, so a consumer-declared one could render wrongly while type-checking. Transclusion precedes everything that reads the segments it produces. Link rewriting precedes the token rewrite, so a link target opening with a token still carries the token the link stage recognizes; that is what the passthrough predicate is for, and it is how a consumer distinguishes a value to be inserted where it stands (`{name}`) from one to be resolved against the file (`./{name}`). The frontmatter overlay follows every transform over the body, and the inlay stage follows that.

Declaring participation is enough to make one artifact render differently for two destinations with no engine change, which is the whole point of the mechanism: a destination that transcludes but rewrites no links declares the one stage and not the other. A destination declaring no stages at all still gets its file read, a body with no directives being one segment.

**Link rewriting** turns a relative target into the absolute path it deploys at. The grammar is declared, not compiled in: a pattern whose single capture group is the target. The engine owns the flags -- `g` to find every link on a line, `d` to learn where the capture sat -- and replaces the target's own characters rather than rebuilding the link, so a declaration states the grammar and never how to put a link back together. Matching runs a line at a time, so a grammar whose character classes admit a newline cannot run away from a stray opening delimiter and swallow the lines beneath it.

A target that already names its destination is left alone: an anchor, an absolute or home-relative path, anything carrying a URI scheme, and anything opening with a declared token pattern. That last case is why the delimiter is the consumer's: a target opening with a token passes through here, and the token rewrite that follows decides what it becomes. Resolution is against the destination root rather than the tree the rendering file's own kind deploys into, so a link that climbs out of one kind's tree and into another's lands where that other kind actually deploys; one that climbs above the root stays as written and comes back as a diagnostic, no absolute path under that root being able to express where it points.

**An inlay** is a named place an artifact declares in its body, to be filled with the rendered bodies of the artifacts a config binding names. It differs from transclusion on three axes, and each is why it is not one: config names the filler rather than the directive does, so what fills a place is chosen per config rather than fixed at authoring time; the filler is a full artifact rendered in its own right rather than a support file; and an inlay nothing binds strips silently rather than ending the render. The directive is a full line in the target's declared comment syntax, mirroring the include grammar: `<!-- inlay: implementation-preferences -->`.

The stage runs last of all because it reports the line each removed directive stood on, and the frontmatter overlay re-emits its block and so can move every line beneath it; a site computed before that ran would address the wrong line. It declares two marker templates -- one standing `{inlayName}`, fencing a whole filled inlay, and one standing `{artifactId}`, delimiting one bound artifact's body within it, which is the contribution shape a region host already uses -- and an optional line rewrite that makes a bound body sit level with its host. That rewrite is declared rather than compiled in, so demoting a Markdown heading is `^(#{1,5})(?=\s)` to `$1#` written by a consumer and no content format enters the engine. Recognition belongs to the stage alone: a target declaring no inlay stage deploys the directive as text, the answer an `include:` line already gets under no transclusion stage.

Nothing fills an inlay yet. What ships is the directive, the strip, and the sites a fill will be spliced at; bindings and the splice are [issue #346](https://github.com/williamthorsen/workshop/issues/346).

**What a render produces** is the content, the artifact and transcluded partials whose text reached it, the inlays its body declared, and everything a stage could not resolve. Diagnostics travel beside the content rather than in place of it, so a plan records the file it would write next to the reasons it is incomplete. A directive that cannot be read is the exception, ending the render: a cycle or a missing target leaves no body to carry on with, as does an inlay directive naming no single inlay or a body declaring one inlay twice. A render that ended names the stage that ended it, so a reader holding one fatal fault knows whether to open the file an author wrote or the body it was rendered into. Aggregating several artifacts into one file is not the pipeline's; it renders one artifact, and a caller composing a region calls it once per contributor.

Re-rendering unchanged inputs is byte-identical, which is what lets a plan's diff mean something.

`assertRenderTargetsAreConsistent` is to a set of target declarations what the plan and catalog assertions are to their documents, and for the same reason. A target that runs a stage twice, deploys a kind twice, names a kind no descriptor carries, declares a link grammar that will not compile or that captures more than one group, or declares an inlay stage whose marker templates cannot delimit a span or do not stand their placeholder exactly once, is reported before anything renders, rather than at the first body that happens to reach the fault. So is a reshape rule that will not compile.

## The snapshot

`captureSnapshot` reads everything a plan is computed from, so that computing one reads nothing. It is the engine's whole filesystem contact for the plan flow: the packages a config declares, the catalog its folded sources resolve to, the edge graph, every artifact rendered for every target that deploys its kind, the files each artifact ships beside its entry file, a digest per source, and what each target currently holds.

The gather is eager rather than lazy because the loop it serves is a reader's: toggle a selection, recompute, render. A memoized reader threaded through the mechanisms would put a disk read behind the first toggle to reach an artifact nothing had memoized yet. The render matrix is computable up front precisely because it is selection-independent -- it covers every artifact the catalog carries, and what a config selects moves nothing in it.

**What an edited config may change against one snapshot is a selection.** The catalog ranks candidates by adopted-source order, and both the edge graph and the render matrix read the winning candidate alone, so a config that adds, drops, reorders, or remaps a source invalidates all three at once. The snapshot carries the resolution it was captured over, which is what lets a later flow compare and refuse rather than compose a plan from a catalog that no longer describes the sources. Widening that would mean ranking candidates from every declared source and reading edges and bodies from the losers too, a cost paid on every capture for a question no interactive loop asks.

**A file the engine deployed is recognized by its shape.** No record of a previous apply is kept, so within a deployment's tree a file whose position and name invert to a slug counts as previously deployed, and that slug with the deployment's kind recovers the artifact it came from. One template renders the name and recovers it, as one template writes a contribution's markers and reads them back. That is what lets an artifact deleted from every source still be classified as removed, and it is why the inverse is anchored: a template's literal parts have to account for the whole name rather than appear somewhere inside it.

A path is claimed once however many deployments match it, and carries each artifact their rules recover. Two kinds rooted at one directory produce that, which is how a rulebook deploys under a template among an untemplated kind's artifacts; a name fitting both templates came from either, and no declaration says which. Carrying both is what lets a consumer refuse a path whose provenance is undecidable rather than write or delete on a guess.

Three exclusions bound the claim, each answering a way the rule could take a file that is not the engine's. Names beginning with a dot or an underscore are support content, the rule a source is enumerated by. Within a claimed artifact only tool state is passed over, the rule that artifact's own digest is taken by, so what a source ships and what a destination claims cover the same files. Every declared region host is excluded wherever it falls, a host being a file the engine does not otherwise own -- that is the case `assertRenderTargetsAreConsistent` leaves here, being decidable only against the slugs a catalog turns out to carry. A directory is claimed only when it holds its layout's entry file, since this scan's output is what decides removal and a directory bearing an artifact's name and nothing else is somebody else's.

**An artifact's entry file renders and everything else it ships is copied byte for byte.** The split names no file type, which keeps a vocabulary of binary extensions out of an engine that has none, and it is the only reading under which an image beside a text artifact survives. Those files are keyed by artifact rather than by artifact and target, no target transforming them; where each lands follows from the name its artifact deploys under. A body is carried as text where its bytes survive a UTF-8 round trip and byte for byte where they do not, which is the same question asked of the bytes rather than of the name.

Faults divide as they do everywhere else. A fault in the declarations a consumer wrote throws before anything is read, so a bad target or token kind is reported rather than surfacing at whichever file first reaches it. A permissions fault throws. A render that cannot resolve a directive travels in the matrix as the failure it is, to become a diagnostic where a plan or a validation report is assembled. Reading target state is skippable, for a caller reporting authoring mistakes with no deployment to plan.

A source's digest covers its whole directory rather than the artifacts enumerated from it, because partials sit outside that enumeration and still reach renders through transclusion. A target's digest covers the sorted paths and hashes of everything claimed and every host it carries, so scan order cannot reach it.

## The plan

A plan is the engine's output: the complete rendered result of a composition, before anything is written. It answers four questions at once.

- **What the output looks like.** Every file for every target, with its body available, so the whole result can be inspected before apply.
- **How it differs from what is there now.** Each artifact and file is classified `added`, `changed`, `removed`, or `unchanged`.
- **Why each part of it is there.** Which source an artifact resolved from, which sources lost, which config tier decided it, what pulled it into the closure, and which artifacts and transcluded partials contributed to each output file.
- **What it was computed from.** Digests of the config, the sources, and the target's own state, so staleness is a comparison rather than a file watch.

The payload is normalized: cross-references between tables are opaque ids, because the provenance graph has diamonds and JSON holds no references. The per-target directory tree follows from the paths in `files`, and file bodies live in a content-addressed `blobs` table keyed by hash, so a body shared across targets is carried once. The table holds exactly the bodies `files` names, so a plan carries no body a reader cannot reach through a file.

Its artifact shape is also the closure's: a closure artifact is this one with `status` removed, derived from it rather than declared beside it, so the two documents cannot drift in how they record an edge, a seed, or a resolution. The status is what a plan adds, measuring an artifact against target state a closure has not looked at.

Ordering is part of the contract. Id-keyed tables run lexicographically, `files` runs by target then path, and `blobs` is keyed in hash order, so two plans of the same shape diff cleanly. `sources`, `tiers`, and each list of shadowed candidates run in precedence order instead, where the order is the meaning, and each artifact's `seededBy` follows `tiers`.

A target's `containerDirs` names the directories it holds independently of what the composition puts in them. That is the one fact a directory tree carries which a list of file paths cannot: a reader clearing an artifact's own directory away has to know where to stop, and nothing else in the payload separates a directory the composition created from one it merely filled. The layout roots are almost visible through `files` already; which of them are structural is not.

`tiers` names the config tiers a seed can be decided by, and runs lowest precedence first: that is the order a fold applies them in, so the last tier to speak wins. It is deliberately the reverse of `sources`, where the first entry wins, because a source's position encodes precedence directly while a tier's encodes application. An artifact several tiers seed carries one seed record each, which is what tells a project-level opt-in from an inherited one.

`tokenKinds` names the token kinds a target's mappings are keyed by, so a `tokenMappings` entry resolves to something a reader recognizes rather than to a bare id. It carries identity alone; the pattern a kind matches and the way it resolves are engine input, not payload. A kind's per-target sigil rides on the mapping itself, where the target and the kind already meet.

Token mappings are the whole of a target's substitution vocabulary. A named value a body interpolates -- the guidance filename a harness reads, its home directory -- is a mapping token kind, not a table of its own: a name-to-value pairing is inert without a pattern that recognizes a reference to it, and a pattern is what a token kind is.

## Composing a plan

`composePlan(config, snapshot)` is pure and synchronous, and no filesystem import reaches its module graph. That is what makes What-if the same call with an edited config: a reader toggles a selection and replans against one capture as often as it likes, and the workspace the snapshot was taken over may be gone by the time it does.

Two things put a snapshot out of date, and both are refused rather than composed around. A config whose adopted sources have moved -- added, dropped, reordered, or remapped -- is refused, the catalog ranking candidates by that order and both the edge graph and the render matrix reading the winning candidate alone. A snapshot captured without target state is refused too: reading its absence as an empty destination would call every file `added`, and apply would then read everything already on disk as drift. `computeFingerprint` is exported beside the flow and refuses the same two, so detecting staleness is one comparison of `composite` against the plan in hand.

**Where the planned content cannot be computed, the destination stands as it is.** A render that failed and a region host whose markers are damaged both leave the engine with no body to write. The file is planned at the body that destination holds, on both sides, with `blocked` carrying the reason; a destination holding nothing yields no entry at all, nothing being what will stand there. That is what `FileBlock` is for -- a plan records the intent and the refusal side by side -- and it is why an unchanged file may carry a block: `unchanged` also covers a change that could not be computed, and the block is the whole record of why nothing will be written.

The two faults are not the same kind of thing, which is why only one of them ends here. A render that fails is a fault in what an author wrote, and validate reports it from the same snapshot. A damaged host is a fact about the destination, which validate never looks at, running as it does over a snapshot captured without target state.

A failed render blocks its artifact's whole file set at that target, assets included: an artifact with a fresh diagram beside a body a stale render left behind is worse than one left alone. Among a host's contributors, one failed render blocks the whole host, rebuilding the region without a contributor's block being something a reader cannot tell from a removal.

Removal follows from a destination nothing plans, never from a render that failed, so a directive an author has just broken proposes no deletion. A path whose claim rules name more than one artifact is blocked whatever its status, its provenance being undecidable from shape. Two deployments landing on one path is that same fact seen from the planning side: the entries collapse into one blocked entry naming each artifact that wanted the destination. Neither name resolution nor the render-target consistency pass can see such a collision -- one holds a single lookup with no artifact set to compare against, the other no catalog to learn which slugs a template will produce -- so composing is the first place it is visible at all. Each contender keeps the status its own content earned: what will happen at a contested destination is the file's to say, and an artifact reported as unchanged because its destination is contested would hide a body that genuinely moved.

**An artifact's status measures its own content, not the files it lands in.** Several artifacts share one aggregated host, and a roll-up over files would move every contributor whenever any one of them moved; a region contributor is judged by its own block against the block the host carries for it. An artifact with nothing to judge -- a kind emitting no files, a kind no target deploys, an artifact blocked everywhere -- is `unchanged`, nothing recording where it previously stood.

Contributions compose into a host in artifact-id order, the order every id-keyed table in a plan runs in and the only one two composes over one snapshot cannot disagree on.

A deployment with nowhere to put what an artifact ships beside its entry file places none of it. A region-routed kind contributes a body to a host rather than a tree, and a tree deployment laid out one file per artifact holds exactly one file. A kind's layout in a source and its layout at a target are separate declarations, so a kind that ships assets can be flattened at a destination with no room for them.

## Applying a plan

`applyPlan(plan, { baseDir, force, dryRun })` writes a plan to the destinations it was composed for and takes away what it no longer plans. It reads the plan alone, so a plan serialized and read back applies as faithfully as one just composed -- which is what keeps apply a step a consumer can take over a payload it was handed rather than one only the engine that composed it can take.

**Idempotence follows from the guard rather than from a pass that checks afterwards.** Each destination is compared against both of the plan's sides. One already holding the planned body has nothing to do; one holding the body the plan recorded as current is written; one holding neither moved after the plan was composed, and is passed over. So a second apply finds the planned body everywhere the first one wrote, and an empty plan touches nothing, the two being one fact rather than two guarantees. Comparing against the current side alone would read every file applied once as drifted the next time round.

Every destination is read, one the plan calls unchanged included, so a file that moved after the plan was composed reports as drift rather than as a quiet success. Nothing is written for it either way.

`force` writes over drift. It never overrides a block: a destination whose content the plan could not compute, or whose provenance is undecidable from shape, is not made decidable by a flag. `dryRun` runs the identical walk and writes nothing. Emptiness is computed from what a run removes and what it writes rather than observed after the fact, so a dry run and the run that follows it record the same actions without a second code path kept in step.

**A region host is written whole**, its planned body being the host with the owned region injected into it, so an edit elsewhere in that host reads as drift like any other. Re-injecting the region into the drifted host is possible from the plan alone, the file's ownership carrying the markers, and it is the wrong answer: the plan shows the bytes that will be written, and a host's own content is among the inputs the fingerprint covers precisely because planned content is derived from it. A moved host is what capturing afresh answers.

Removal deletes what nothing plans and takes away the directory it empties, bounded by the target's `containerDirs`. A target naming none, which a plan composed before that field is, keeps every directory it holds.

A plan this engine will not write is refused before the first write, so no destination is left half applied: content the plan does not carry in full, a body no `blobs` entry holds, a file naming a target the plan does not carry, a path that is absolute or climbs out of the target, and entries ownership, which would be written whole and take another tool's items with it. The engine composes neither an escaping path nor entries ownership, so a plan carrying either came from elsewhere -- which is the case a consumer applying a payload it was handed has to be safe under, and the escaping path is the one whose cost is a file outside the target. The outcome records each destination in plan order with what it holds afterwards, beside the plan's own fingerprint, which is the shape a persisted record of what was applied would keep.

## Validating a composition

`validateComposition(config, snapshot)` reports every fault a config and the content it reaches carry: a selector naming nothing, a frontmatter edge that dangles or closes a cycle, a directive that cannot be resolved, a token or a link that cannot be rewritten, and a destination more than one of a target's deployments writes. Each diagnostic arrives from the domain that found it unchanged, keeping the location that domain gives it, so a reader reaches the config entry an author wrote, the artifact carrying a key, or the line a directive occupies. One merged shape could only approximate that.

**What a destination holds takes no part.** The faults reported here are in what someone wrote, and a report that moved with a destination would answer a different question each time it ran. A snapshot captured with the destination scan skipped therefore validates as well as one captured with it, and the two yield the same report. It is the same division that leaves a damaged region host to composition: that is a fact about the destination, and this is not.

Only what the config reaches is reported. The render matrix covers the whole catalog by design, so an artifact this config does not select carries faults that are somebody else's to fix, and reporting them would bury the ones that are not.

The destination collision is the one diagnostic shape validation adds. Composing finds the same collision from the entries two deployments both drafted, which takes target state to reach; here it follows from deployed paths alone, so it is answerable before any destination has been looked at. A destination counts per deployment rather than per artifact, so a region host stays uncontested however many artifacts aggregate into it, and the diagnostic names the kinds whose deployments contend beside the artifacts whose content they would write.

## What the schema checks, and what it does not

`PlanSchema` is purely structural. It validates shapes and nothing else, which keeps it renderable to JSON Schema; a validation refinement would be invisible to `z.toJSONSchema` and would leave a generated document accepting plans this package rejects.

The invariants therefore live outside it, in `assertPlanIsConsistent`:

- every cross-table id reference resolves; no table carries one id twice, and no two file entries claim one destination;
- a `partialId` appears only on a `token` edge, the only origin read from a partial;
- shadowed candidates follow their winner in source precedence order;
- a plan declaring `contentAvailability: 'complete'` carries every body it references;
- each file's recorded status agrees with the two sides beside it.

A consumer parsing with `PlanSchema` alone has checked none of these. Call the assertion too, or treat a dangling reference as possible.

The derived views also live outside the payload. Dependency edges are stored forwards only: paths from a seed to an artifact are enumerated on demand by `resolveInclusionPaths`, because a diamond-heavy graph grows them faster than a plan recomputed on every toggle can carry, and the reverse "used by" direction is indexed by `buildDependentsIndex` rather than written twice.

Both take any document carrying artifacts and edges, not a plan specifically, so the closure the engine computes from a config uses them unchanged. `buildTraversalIndex` adds the artifact-to-file direction on top, which is a plan's alone: a closure has no files to point at.

## Evolution

`schemaVersion` bumps when a field is removed, renamed, or re-typed. It does not bump when an optional field is added.

That promise holds because objects in this schema are open: an unrecognized field parses and is dropped, so a consumer pinned to one version accepts a payload from a later one. Making any object strict would break it the first time a field was added.

The contract is at version 4. Version 4 removed each target's `variables` table, whose entries a mapping token kind already expresses; nothing could read it, since it declared names and values but no pattern that would recognize a reference to one. Version 3 added the `tokenKinds` table, which every target's `tokenMappings` already referenced with nothing to resolve against. Version 2 added the `tiers` table and re-typed each `seededBy` entry from a bare origin into a record naming the tier that decided the seed; the origin `package-catalog` became `source-catalog` in the same change, because taking everything a source carries is a selection any source can be the object of.

## Samples

Two plans ship as JSON, both validating against the schema and satisfying every invariant:

- `samples/minimal.json` is the smallest plan the contract allows, for a consumer rendering its first view.
- `samples/representative.json` exercises every shape the contract carries: an artifact reached by three dependency routes, shadowed candidates beside an artifact the lowest-precedence source wins, three artifacts aggregated into one region behind per-artifact markers, entry-level ownership of a structured config, a byte-encoded asset, a file apply will skip, an artifact two tiers both seed, and all four diff statuses.

Both are generated from typed builders that digest their own content, so no hash is written by hand, and both are committed and pinned byte for byte by a drift test. Regenerate them with `node config/generateSamples.ts`, which also runs as part of `prepare`.
