# @williamthorsen/compositor

Content-agnostic engine that resolves declaratively opted-in content across precedence-ordered sources, computes the transitive dependency closure, and plans idempotent writes to per-target destinations.

Private and unreleased: the name is provisional, and the engine does not exist yet. What ships today is the plan schema, the contract its output will satisfy. The requirements it is built to are tracked in [issue #158](https://github.com/williamthorsen/workshop/issues/158).

## The plan

A plan is the engine's output: the complete rendered result of a composition, before anything is written. It answers four questions at once.

- **What the output looks like.** Every file for every target, with its body available, so the whole result can be inspected before apply.
- **How it differs from what is there now.** Each artifact and file is classified `added`, `changed`, `removed`, or `unchanged`.
- **Why each part of it is there.** Which source an artifact resolved from, which sources lost, what pulled it into the closure, and which artifacts and transcluded partials contributed to each output file.
- **What it was computed from.** Digests of the config, the sources, and the target's own state, so staleness is a comparison rather than a file watch.

The payload is normalized: cross-references between tables are opaque ids, because the provenance graph has diamonds and JSON holds no references. The per-target directory tree follows from the paths in `files`, and file bodies live in a content-addressed `blobs` table keyed by hash, so a body shared across targets is carried once.

Ordering is part of the contract. Id-keyed tables run lexicographically, `files` runs by target then path, and `blobs` is keyed in hash order, so two plans of the same shape diff cleanly. `sources` and each list of shadowed candidates run in precedence order, where the order is the meaning.

## What the schema checks, and what it does not

`PlanSchema` is purely structural. It validates shapes and nothing else, which keeps it renderable to JSON Schema; a validation refinement would be invisible to `z.toJSONSchema` and would leave a generated document accepting plans this package rejects.

Three invariants therefore live outside it, in `assertPlanIsConsistent`:

- every cross-table id reference resolves; no table carries one id twice, and no two file entries claim one destination;
- a `partialId` appears only on a `token` edge, the only origin read from a partial;
- shadowed candidates follow their winner in source precedence order;
- a plan declaring `contentAvailability: 'complete'` carries every body it references;
- each file's recorded status agrees with the two sides beside it.

A consumer parsing with `PlanSchema` alone has checked none of these. Call the assertion too, or treat a dangling reference as possible.

Two derived views also live outside the payload, in `buildTraversalIndex` and `resolveInclusionPaths`. The plan stores dependency edges forwards only: paths from a seed to an artifact are enumerated on demand, because a diamond-heavy graph grows them faster than a plan recomputed on every toggle can carry, and the reverse "used by" direction is indexed per plan rather than written twice.

## Evolution

`schemaVersion` bumps when a field is removed, renamed, or re-typed. It does not bump when an optional field is added.

That promise holds because objects in this schema are open: an unrecognized field parses and is dropped, so a consumer pinned to one version accepts a payload from a later one. Making any object strict would break it the first time a field was added.

## Samples

Two plans ship as JSON, both validating against the schema and satisfying every invariant:

- `samples/minimal.json` is the smallest plan the contract allows, for a consumer rendering its first view.
- `samples/representative.json` exercises every shape the contract carries: an artifact reached by three dependency routes, shadowed candidates beside an artifact the lowest-precedence source wins, three artifacts aggregated into one region behind per-artifact markers, entry-level ownership of a structured config, a byte-encoded asset, a file apply will skip, and all four diff statuses.

Both are generated from typed builders that digest their own content, so no hash is written by hand, and both are committed and pinned byte for byte by a drift test. Regenerate them with `pnpm exec tsx config/generateSamples.ts`, which also runs as part of `prepare`.
