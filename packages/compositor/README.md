# @williamthorsen/compositor

Content-agnostic engine that resolves declaratively opted-in content across precedence-ordered sources, computes the transitive dependency closure, and plans idempotent writes to per-target destinations.

Private and unreleased: the name is provisional, and most of the engine does not exist yet. What ships today is the plan schema, the contract the engine's output will satisfy, and the flows built against it so far: the config model, source resolution, selection, and the mechanisms that own part of a destination and overlay a target's metadata. The requirements it is built to are tracked in [issue #158](https://github.com/williamthorsen/workshop/issues/158).

## Config

A config is a list of tiers, lowest precedence first, the order a fold applies them. Each tier declares the sources it adds or drops, and per artifact kind the artifacts it uses or drops. `loadConfig` reads one file per tier, but files are one way to obtain a config rather than the only one: what it returns is the same shape a caller can build in memory and hand straight to the flows downstream, which is what lets an edited config be evaluated without touching disk.

Tier identity -- an id, a label, and the directory a relative path resolves against -- is the consumer's to supply. A file does not know which tier it is; that follows from where the consumer looked for it, which is what keeps any particular project layout out of the package. A tier whose file is absent contributes nothing, while one whose file is present and empty contributes a tier declaring nothing, so an absent tier stays distinguishable from a silent one.

Parsing normalizes: a bare slug becomes an entry, `path` or `package` becomes a source origin, and a kind-keyed mapping becomes an array ordered by kind. Every schema also accepts its own output, so a config already parsed can be modified and re-parsed without being converted back first. These schemas therefore carry transforms and do not render to JSON Schema, unlike the plan and catalog contracts; config is authored input rather than an emitted payload, which is also why it carries no version.

Sources and packages are one declaration list: a package is a source whose location is a package name, which the plan schema's source origin already allows. `resolveSources` folds the tiers into the ordered list resolution reads, locating each package by walking the `node_modules` chain from the tier that declared it and reading the content directory that package declares under a key the consumer names. Precedence runs higher tier first, and author order within a tier, so a config reads with precedence descending down the page. The names a tier dropped and no higher tier re-adopted come back beside the sources, which is what distinguishes a source a consumer turned down from one it never mentioned.

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

## The plan

A plan is the engine's output: the complete rendered result of a composition, before anything is written. It answers four questions at once.

- **What the output looks like.** Every file for every target, with its body available, so the whole result can be inspected before apply.
- **How it differs from what is there now.** Each artifact and file is classified `added`, `changed`, `removed`, or `unchanged`.
- **Why each part of it is there.** Which source an artifact resolved from, which sources lost, which config tier decided it, what pulled it into the closure, and which artifacts and transcluded partials contributed to each output file.
- **What it was computed from.** Digests of the config, the sources, and the target's own state, so staleness is a comparison rather than a file watch.

The payload is normalized: cross-references between tables are opaque ids, because the provenance graph has diamonds and JSON holds no references. The per-target directory tree follows from the paths in `files`, and file bodies live in a content-addressed `blobs` table keyed by hash, so a body shared across targets is carried once.

Ordering is part of the contract. Id-keyed tables run lexicographically, `files` runs by target then path, and `blobs` is keyed in hash order, so two plans of the same shape diff cleanly. `sources`, `tiers`, and each list of shadowed candidates run in precedence order instead, where the order is the meaning, and each artifact's `seededBy` follows `tiers`.

`tiers` names the config tiers a seed can be decided by, and runs lowest precedence first: that is the order a fold applies them in, so the last tier to speak wins. It is deliberately the reverse of `sources`, where the first entry wins, because a source's position encodes precedence directly while a tier's encodes application. An artifact several tiers seed carries one seed record each, which is what tells a project-level opt-in from an inherited one.

`tokenKinds` names the token kinds a target's mappings are keyed by, so a `tokenMappings` entry resolves to something a reader recognizes rather than to a bare id. It carries identity alone; the pattern a kind matches and the way it resolves are engine input, not payload. A kind's per-target sigil rides on the mapping itself, where the target and the kind already meet.

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

The contract is at version 3. Version 3 added the `tokenKinds` table, which every target's `tokenMappings` already referenced with nothing to resolve against. Version 2 added the `tiers` table and re-typed each `seededBy` entry from a bare origin into a record naming the tier that decided the seed; the origin `package-catalog` became `source-catalog` in the same change, because taking everything a source carries is a selection any source can be the object of.

## Samples

Two plans ship as JSON, both validating against the schema and satisfying every invariant:

- `samples/minimal.json` is the smallest plan the contract allows, for a consumer rendering its first view.
- `samples/representative.json` exercises every shape the contract carries: an artifact reached by three dependency routes, shadowed candidates beside an artifact the lowest-precedence source wins, three artifacts aggregated into one region behind per-artifact markers, entry-level ownership of a structured config, a byte-encoded asset, a file apply will skip, an artifact two tiers both seed, and all four diff statuses.

Both are generated from typed builders that digest their own content, so no hash is written by hand, and both are committed and pinned byte for byte by a drift test. Regenerate them with `node config/generateSamples.ts`, which also runs as part of `prepare`.
