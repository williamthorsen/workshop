# Changelog

All notable changes to this project will be documented in this file.

## 0.4.0 — 2026-08-19

### 🎉 Features

- Fill inlays from config bindings (#356)

  Fills the inlays a body declares with the rendered bodies of the artifacts a config binds to them. A tier's new `inlays` block is keyed by inlay name and carries `select`'s own selector grammar, so that a higher tier unbinds with `drop`, and every artifact a binding names enters the closure as a seed under the new `binding` origin. `fillInlays` splices each bound body into every host declaring that inlay when a plan is composed, reshaped by the target's declared line rewrite and fenced by its declared markers.

  Migration: The plan schema is at version 5 and the closure schema at version 2, each carrying `binding` among an artifact's seed origins.

## 0.3.0 — 2026-08-17

### 🎉 Features

- Apply a plan to its destinations and report a composition's faults (#334)

  Adds `applyPlan` and `validateComposition`, the two flows that consume what `compositor` composes. Apply writes a plan to the destinations it was composed for and takes away what it no longer plans. Validate reports every authoring fault carried by a config and the content it reaches (selection, closure, transclusion, token, link, and destination collision) in one report.

  Separately, a plan's target entries gain `containerDirs`, the directories that a target holds independently of what the composition puts in them.

- Recognize inlay directives and strip them from rendered bodies (#347)

  Adds an `inlay` stage to `compositor`'s transform pipeline: An artifact declares a named place in its body with a full-line directive written in the target's own comment syntax (`<!-- inlay: implementation-preferences -->`), and the stage strips that directive and reports the line it stood on. Recognition belongs to the stage alone, so a target declaring no inlay stage deploys the directive as text. Nothing fills an inlay yet; this ships the render side, with the config bindings that name a filler still to come.

  Separately, `assertRenderTargetsAreConsistent` now rejects a declared `links` grammar or `reshape` rule that ends in an escape, which it previously accepted and left to throw wherever the pattern was compiled.

### ♻️ Refactoring

- Reserve the `is` prefix for type predicates (#335)

  Renames eight boolean functions and function-valued parameters in `compositor` to third-person verb names, so the `is` prefix marks only type predicates.

### 🧪 Tests

- Test the genericity claims against a second consumer's vocabulary (#344)

  Adds a `genericity-fixture.ts` to serve as a hypothetical consumer of `compositor` that is unlike the other content previously tested as the only consumer. A test suite verifies that the `compositor` handles this dissimilar content correctly, checking for correct handling of such features as line-comment directives, `<<label:...>>` tokens, and templating. A feature hard-coded in `compositor` instead of read from the consumer's declaration fails this suite, where the existing pipeline tests would not notice it.

- Replace compositor's `buildTempTree` with toolbelt's `createTempTree` (#349)

  Replaces compositor's local `buildTempTree` test helper with `createTempTree` from `@williamthorsen/toolbelt.filesystem`. Adds `@williamthorsen/toolbelt.filesystem` and `@williamthorsen/toolbelt.vitest` as dev dependencies of Compositor.

## 0.2.0 — 2026-08-15

### 🎉 Features

- Compose a plan from a config and a snapshot (#327)

  Adds `composePlan(config, snapshot)` to `compositor`, which assembles a whole `Plan` from a config and a capture: every target's files, each artifact's status against what its destinations hold, and a fingerprint of the inputs. It is pure and synchronous, and no filesystem import reaches its module graph. What-if planning is therefore the same call with an edited config, and the workspace the capture was taken over may be gone by then. `computeFingerprint` is exported beside it, so that a stale capture can be detected by means of a single comparison.

  Where the engine cannot decide what a destination should hold (such as a render that failed, a region host whose markers are damaged, or a path written to by multiple deployments), the file is planned at the body already there, carrying the reason. A broken directive therefore proposes no deletions.

### ♻️ Refactoring

- Adopt toolbelt.errors for error-message extraction and cause-chaining (#296)

  Consolidates error-message extraction across the workspace on `@williamthorsen/toolbelt.errors`, replacing the helper `overlay` and `readyup` had each defined for itself along with every inline copy of the same idiom. Failures that wrap a cause now chain through the same library, and lint fails on the inline idiom, naming `describeError` as its replacement. A `catalog:` block in `pnpm-workspace.yaml` becomes the single declaration site for every version more than one manifest declares.

- Adopt toolbelt's captureError and retire every local capture helper (#324)

  Adopts `captureError` from `@williamthorsen/toolbelt.testing` as the standard way to capture an error in tests across the repo, replacing the hand-rolled error-capture helpers.

## 0.1.1 — 2026-08-08

### 🐛 Bug fixes

- Read package versions at run time instead of generating them (#275)

  Fixes an issue where `readyup` and `compositor` could keep reporting an old version after a bump, which also left readyup's warnings about mismatched versions wrong. A fresh install or rebuild is no longer required.

## 0.1.0 — 2026-08-08

### 🎉 Features

- Add repo-wide kit discovery with rdy list --recursive (#253)

  Adds a recursive option to ReadyUp's list command. `rdy list --recursive` reports the kits across an entire repository in a single pass. The listing groups kits by containing project, shows the description each project records for its kits, and pairs each group with the command that runs those kits from the current directory.

## 0.0.1 — 2026-08-05

### 🏗️ Internal features

- Add the Compositor package (#171)

  Adds `@williamthorsen/compositor`, a private package for the content-composition engine now under construction. It publishes nothing and exports nothing yet.

- Design the Compositor plan schema (#172)

  Introduces the plan contract: the full shape a composition's result takes and the guarantees made about that shape, verifiable by an accompanying check. Two sample plans now ship with the package. The contract is versioned. The version changes whenever a field is removed, renamed, or re-typed, but not when an optional field is added.

- Resolve declared sources into a catalog of what they carry (#175)

  Introduces source resolution to Compositor: a single crawl over a set of sources, in declared precedence order, that reports every item any source holds, the source it comes from, which other sources carried it, and whether their copies differ from the one that overrides them. Precedence follows source order alone, so a bundled built-in library holds no special standing. A source that is missing or unreadable aborts the crawl rather than counting as empty.

- Add tier provenance to the plan schema and share the traversal helpers (#179)

  A plan now records which configuration tier decided each artifact's presence, so that a consumer can tell a project-level opt-in from an inherited one. An artifact's reason for inclusion and its dependents can now be determined from any document that records artifacts and the links between them, not a plan alone.

- Port the config model and tiered selection (#182)

  Adds tiered content selection. A consumer declares what it wants (named artifacts, everything from a given source, unwanted artifacts) and gets back exactly what was requested, each item having its provenance attached. Tiers stack the way layered config usually does: A project inherits what the tiers beneath it declared, and can extend that, refuse parts of it, or clear the slate and start fresh. Content selection is generic: The consumer names the tiers and the kinds of artifacts.

- Port transclusion and declarative token kinds (#209)

  Compositor now transcludes one file's content into another and resolves placeholder tokens, using an inclusion syntax and token vocabulary declared by the consumer. A token resolves against its containing file, not the file that pulled it in. Tokens naming an artifact render under the name by which the artifact is known by each destination; dependencies they imply surface before any destination is chosen. Authoring mistakes in composed content are reported without aborting generation of the remainder of the composition plan.

- Port destination ownership and frontmatter merge (#213)

  Compositor gains the ability to insert content into files that are not its own, writing into a bounded region of a text file or individual items in a YAML or JSON document. Several artifacts can share a single region and remain individually identifiable within it. A target can now also set metadata on the artifacts it renders, as defaults for all of them and as overrides for a single one. Unsafe writes are blocked with a notification. Re-applying an unchanged result leaves a file in an identical state.

- Port the dependency closure (#218)

  A request for a set of artifacts now expands to encompass their dependencies, returning a result that can be written out and compared and cheaply recomputed when a selection is toggled. Cycles among dependencies, references to nonexistent content, and malformed declarations are reported against the artifact responsible, so that a single pass surfaces every fault in the content tree.

- Declare target deployment and compose the transform pipeline (#220)

  Enables six features of the deployment pipeline:

  - Destinations can declare where content goes.
  - Destinations can decline certain kinds of content.
  - Deployed artifacts can be differently named in different destinations.
  - Intra-content links are transformed to in-destination links.
  - Destinations declare which processing steps should run.
  - A broken configuration is caught early.

- Split source resolution into locate and fold, and add the region deployment form (#232)

  Re-resolving an edited configuration no longer reads the filesystem. It reuses the packages an earlier pass located, so previewing a renamed source, a remapped path, reordered tiers, or a dropped and re-adopted source is fast enough for an interactive edit-and-preview loop. Only naming a package no earlier pass saw still needs a fresh walk.

  A destination can now route a whole artifact kind into one shared file it does not otherwise own, such as an ambient guidance file holding many contributions, instead of giving each artifact its own file or directory. A mistake in that declaration is reported before any file is written. And a package a configuration declares and then drops no longer has to be installed for the configuration to resolve.

- Capture the composition snapshot (#241)

  Recomputing a composition after changes in a consumer's opt-ins no longer requires further disk operations. Content dropped from every source is now planned for removal from its destination instead of being left in place. Files (whether binary or text) shipped alongside an artifact's entry file now travel with it. A declaration that would deploy files untracked by the engine is now rejected outright, preventing the accumulation of files for which there is no cleanup mechanism.

### ♻️ Refactoring

- Extract the shared consistency vocabulary and decompose the assertions (#189)

  The consistency failures for plans and catalogs now extend a common `ConsistencyError`, allowing validation code to check a single type.

- Give the flow modules' helpers their own modules (#190)

  Generic filesystem and path helpers are now grouped under `portable/`, identifying them as candidates for extraction and reuse.

- Name each schema module for one subject (#194)

  Renames Compositor files to make their content and schema contract evident from the file name alone. This brings the files into alignment with in-house naming conventions.

- Resolve the traversal and test-helper name collisions (#196)

  Replaces the duplicative names of Compositor's dependency-graph traversal modules and catalog test builders with names that better communicate their contents.

- Decompose the representative sample builder (#197)

  Decomposes compositor's monolithic sample plan into one module per table. The fingerprint's source and target ids are no longer duplicated, but derived directly from those tables. The published sample JSON is unchanged.

- Conform property names to the naming conventions (#227)

  Aligns property names with in-house naming conventions.

### ⚙️ Tooling

- Upgrade nmr, release-kit, and v11y-check (#193)

  Upgrades several dependencies, notably `nmr` to 0.24. That upgrade changes Vitest configuration so that test suites are selected by a tier ("unit", "tool", "localhost", and "remote") corresponding to the services they use. `nmr test:unit` and `nmr test:tool` each run one of these; `nmr test:all` runs every suite. `nmr test:integration` no longer exists, and no tests carry the `.int.` infix. The upgraded `nmr` includes a caching feature that skips checks that already succeeded against an identical working tree.

### 📚 Documentation

- Apply comment discipline to the schema modules (#202)

  Tightens comments by removing narration of development history and focusing them on the code itself. Function descriptions are now aligned with house style.

- Revise comments in the config and resolution modules (#203)

  Tightens comments by reducing duplication, removing narration of development history, and focusing on the code itself. Function descriptions are now aligned with house style.

- Apply comment discipline to the plan, consistency, graph, and selection modules (#204)

  Tightens comments by reducing duplication, removing narration of development history, and focusing on the code itself. Function descriptions are now aligned with house style.

- Apply comment discipline to the portable, samples, and scaffolding modules (#205)

  Tightens comments by reducing duplication, removing narration of development history, and focusing on the code itself. Function descriptions are now aligned with house style.

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
