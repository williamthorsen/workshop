# @williamthorsen/compositor

Content-agnostic engine that resolves declaratively opted-in content across precedence-ordered sources, computes the transitive dependency closure, and plans idempotent writes to per-target destinations.

Private and unreleased: the name is provisional, and most of the engine does not exist yet. What ships today is the plan schema, the contract the engine's output will satisfy, and the flows built against it so far: the config model, source resolution, and selection. The requirements it is built to are tracked in [issue #158](https://github.com/williamthorsen/workshop/issues/158).

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

`assertCatalogIsConsistent` is to a catalog what `assertPlanIsConsistent` is to a plan, and for the same reason: the schema is purely structural, so id references, entry-id composition, and shadowed-candidate ordering are checked outside it. A catalog `resolveCatalog` produced satisfies all of it by construction, so resolution does not pay for the checks; call the assertion on a catalog that arrived as data.

No sample catalogs ship. The plan schema needed them because no engine existed to produce a plan; a catalog comes from calling the resolver.

## Selection

`selectArtifacts` folds a config against a catalog and answers which artifacts were asked for. It is pure: the catalog is the only view of the filesystem, so re-running it over a changed config reads nothing, which is what makes a toggle-and-recompute loop free.

An entry names one artifact or takes everything a source carries, and either form is valid in `use` and in `drop`, so "all of this source except that one" is expressible. Taking a source whole selects the artifacts that source carries, including those a higher-precedence source shadows: shadowing settles which copy an artifact resolves from, and selection settles which artifacts are in play. Indexing winners alone would make a source's contribution shrink as higher-precedence sources were declared above it.

Seeds and declines stay disjoint per artifact. A `drop` clears the seeds beneath it and records the tier that dropped it; a later `use` clears the decline and seeds afresh. What survives to the end is what decided the final state, which is what tells a project-level opt-in from an inherited one, and it is recorded in the plan schema's own seed shape rather than a parallel one.

A selection is a plain value, not a versioned document like a catalog. A document earns its cost when re-deriving the payload is expensive or impossible; a selection is a cheap pure function of two documents that already exist, so nothing can hold one it cannot recompute. A declined artifact has no plan representation yet -- `removed` means deployed and no longer selected, which is a different fact.

A selector matching nothing yields a diagnostic naming the tier, kind, list, and position that produced it, rather than throwing, so validation reports every mistake in a config at once and a reader can attach each to the line an author wrote.

## The plan

A plan is the engine's output: the complete rendered result of a composition, before anything is written. It answers four questions at once.

- **What the output looks like.** Every file for every target, with its body available, so the whole result can be inspected before apply.
- **How it differs from what is there now.** Each artifact and file is classified `added`, `changed`, `removed`, or `unchanged`.
- **Why each part of it is there.** Which source an artifact resolved from, which sources lost, which config tier decided it, what pulled it into the closure, and which artifacts and transcluded partials contributed to each output file.
- **What it was computed from.** Digests of the config, the sources, and the target's own state, so staleness is a comparison rather than a file watch.

The payload is normalized: cross-references between tables are opaque ids, because the provenance graph has diamonds and JSON holds no references. The per-target directory tree follows from the paths in `files`, and file bodies live in a content-addressed `blobs` table keyed by hash, so a body shared across targets is carried once.

Ordering is part of the contract. Id-keyed tables run lexicographically, `files` runs by target then path, and `blobs` is keyed in hash order, so two plans of the same shape diff cleanly. `sources`, `tiers`, and each list of shadowed candidates run in precedence order instead, where the order is the meaning, and each artifact's `seededBy` follows `tiers`.

`tiers` names the config tiers a seed can be decided by, and runs lowest precedence first: that is the order a fold applies them in, so the last tier to speak wins. It is deliberately the reverse of `sources`, where the first entry wins, because a source's position encodes precedence directly while a tier's encodes application. An artifact several tiers seed carries one seed record each, which is what tells a project-level opt-in from an inherited one.

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

The contract is at version 2. Version 2 added the `tiers` table and re-typed each `seededBy` entry from a bare origin into a record naming the tier that decided the seed; the origin `package-catalog` became `source-catalog` in the same change, because taking everything a source carries is a selection any source can be the object of.

## Samples

Two plans ship as JSON, both validating against the schema and satisfying every invariant:

- `samples/minimal.json` is the smallest plan the contract allows, for a consumer rendering its first view.
- `samples/representative.json` exercises every shape the contract carries: an artifact reached by three dependency routes, shadowed candidates beside an artifact the lowest-precedence source wins, three artifacts aggregated into one region behind per-artifact markers, entry-level ownership of a structured config, a byte-encoded asset, a file apply will skip, an artifact two tiers both seed, and all four diff statuses.

Both are generated from typed builders that digest their own content, so no hash is written by hand, and both are committed and pinned byte for byte by a drift test. Regenerate them with `pnpm exec tsx config/generateSamples.ts`, which also runs as part of `prepare`.
