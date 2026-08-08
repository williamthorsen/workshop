# Changelog

All notable changes to this project will be documented in this file.

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
