# Changelog

All notable changes to this project will be documented in this file.

## [readyup-v0.19.0] - 2026-04-24

### Features

- Add `discoverWorkspaces` check-util for monorepo-aware kits (#74)

  Adds `discoverWorkspaces()` to readyup's `check-utils`, a single helper that enumerates a repo's workspaces across pnpm, npm/yarn, and single-workspace layouts with a uniform return shape. Consumer kits can now answer workspace-iteration questions — including "does this repo have anything publishable?" as `discoverWorkspaces({ filter: (w) => w.isPackage }).length > 0` — without bundling their own `glob` + YAML-parser combination.

## [readyup-v0.18.0] - 2026-04-23

### Bug fixes

- Allow explicit undefined on optional authoring-type fields (#69)

  Fixes an issue where TypeScript consumers of `readyup` with `exactOptionalPropertyTypes: true` could not use idiomatic factory patterns to construct public authoring types. No runtime behavior changes.

### Features

- Detect drift between manifest and compiled kits (#65)

  Adds drift detection for compiled readyup kits so manual or accidental edits to generated `.js` files can no longer be silently erased by `rdy compile`.

  Adds a new `rdy verify` subcommand that audits the manifest on demand without mutating anything, reporting each kit as `ok`, `drift`, `missing`, or `unverified` and exiting non-zero when any kit has drifted or is missing.

- Add isGitRepo, isAtRepoRoot, and expandHome helpers (#72)

  Adds three generic git-path helpers to `readyup`'s `check-utils/git` subpath:
  - `isGitRepo(path)` returns `true` when the path is inside a git working tree (subdirectories and worktrees count).
  - `isAtRepoRoot(path)` returns `true` only when the path is the top of a working tree, using `git rev-parse --show-cdup` to avoid the path-comparison pitfalls of `--show-toplevel`.
  - `expandHome(path)` expands a leading `~` or `~/` to the user's home directory. Previously this existed as a private `expandTilde` inside `run-git.ts`; it is now exported under a more general name so consumers can reuse the same tilde handling that `runGit` uses internally.

## [readyup-v0.17.0] - 2026-04-17

### Bug fixes

- Prevent authoring deps from being bundled into compiled kit (#61)

  Restores compiled kit bundles produced by rdy compile to their pre-regression size of ~7 KB, eliminating a 76× bloat (~526 KB) where every compiled kit silently inlined the entire zod library and its locale files.

### Features

- Add git freshness check utilities (#50)

  Adds git freshness check utilities to readyup's `check-utils` module, enabling kits to verify branch sync state (local-to-local and local-to-remote) without hand-rolling git subprocess calls. The new utilities return discriminated-union results for type-safe status handling and provide check factories with git-status-style diagnostic messages.

- Add manifest schema and `rdy compile` manifest generation (#54)

  Adds a `.readyup/manifest.json` file that is automatically generated on every `rdy compile` invocation, providing machine-readable kit discovery for external consumers. Batch mode writes the full manifest; single-file mode upserts a single entry. A new `rdy list --manifest` flag reads and displays manifest contents. Kit authors can now supply an optional `description` that flows through to the manifest.

- Enable cross-directory kit discovery via manifest (#56)

  Enables `rdy list` to discover compiled kits across directory boundaries by reading location data from the manifest instead of scanning the filesystem. `rdy compile` now records each kit's compiled path, source path, and a content hash in the manifest, making cross-directory resolution possible without filesystem traversal

### Refactoring

- Skip config load for external source flags in `handleRun` (#48)

  Aligns `rdy run` with the rule established by `rdy list`: when an external source flag (`--from`, `--file`, `--url`) is active, project config is not loaded. Makes `internalDir` and `internalInfix` optional in `resolveKitSources`, making the API contract explicit.

### Tests

- Add integration test for `pickJson` compile pipeline (#49)

  Adds an integration test that exercises the full `pickJson` compile pipeline — plugin registration, JSON inlining, runtime stub elimination, and valid ESM output — using real fixture files and `compileConfig`.

## [readyup-v0.16.0] - 2026-04-13

### Bug fixes

- Update list hints and README to use positional kit syntax (#43)

  Fixes the `rdy list` output to show positional kit syntax (`rdy run --jit [<name>]` for internal, `rdy run [<name>]` for compiled) instead of the stale `--kit <name>` flag syntax. Rewrites the README CLI reference to document all current flags, the five `--from` source types, and the `list` command.

### Features

- Add positional kit arguments and multi-kit execution to `rdy run` (#35)

  Promotes kit names to positional arguments (`rdy run mykit1 mykit2`) and adds colon syntax for per-kit checklist filtering (`mykit:check1,check2`). Removes the `--kit` flag and adds `--checklists` for filtering with `--file`/`--url` sources. Restructures JSON output to use a `kits` array with per-kit summary counts, and supports running multiple kits in a single invocation.

- Add utility functions for working with JSON values (#36)

  Adds pure object traversal functions (`getJsonValue`, `hasJsonValue`) for extracting nested values from parsed JSON objects, and a file-level composition (`readJsonValue`) that combines `readJsonFile` with `getJsonValue`. Promotes the existing `isRecord` type guard to the public API.

- Unify kit source selectors into `--from` and default to compiled JS (#38)

  Defaults `rdy run` to compiled `.js` kits and replaces the `--local` and `--github` source flags with a single `--from` flag that uses scheme detection to select the kit source. Adds `--jit` (`-J`) for running from TypeScript source and `--internal` (`-i`) for resolving kits from the configured internal subdirectory.

- Add `pickJson` compile-time JSON inlining (#41)

  Adds compile-time selective JSON field extraction to readyup's esbuild pipeline, so kit authors can inline only specific fields from JSON files instead of bundling the entire file into compiled output.

- Rename rdy identifier to readyup (#47)

  Renames the conventional kits directory from `.rdy/kits/` to `.readyup/kits/` and the config file from `rdy.config.ts` to `readyup.config.ts` across the entire codebase. The `rdy` CLI command name is unchanged — only filesystem conventions adopt the full package name.

## [readyup-v0.15.0] - 2026-04-11

### Features

- Add `computeHash` and `fileMatchesHash` check utilities (#28)

  Adds hash-based file comparison to the check-utils module for detecting drift in configuration files. `computeHash` is a pure function returning a SHA-256 hex digest via `node:crypto`. `fileMatchesHash` composes `readFile` + `computeHash` for ergonomic use in kit checks, returning `false` for missing files consistent with `fileContains`.

- Add `safeJsonParse` utility for safe JSON parsing (#29)

  Adds a reusable `safeJsonParse` utility that wraps `JSON.parse` in a try/catch, returning `undefined` on invalid input instead of throwing. Refactors the existing `readJsonFile` check utility to use it, eliminating inline error handling.

## [readyup-v0.14.0] - 2026-04-11

### Bug fixes

- Normalize CLI output alignment with uniform-width icons (#17)

  Replace the two narrow `ICON_SKIPPED_*` constants in `reportRdy.ts` with their 2-cell-wide counterparts (⚪ → 🔍 and ⛔ → 🚫), bringing the entire icon set to a uniform terminal cell width. Increase the per-depth nesting indent and the continuation-line lead-in from 2 to 3 spaces each. Wire `compileCommand.ts` to import `ICON_SKIPPED_NA` from `reportRdy.ts` under a local alias `ICON_NO_CHANGES`. Migrate icon-using test assertions across three test files to reference imported constants instead of raw Unicode escape sequences.

### Features

- Make summary counts severity-aware (#14)

  Replaces readyup's three-bucket `passed`/`failed`/`skipped`/`allPassed` summary model with a granular `SummaryCounts` shape that tracks failures by severity (`errors`, `warnings`, `recommendations`), skips by reason (`blocked`, `optional`), and carries a `worstSeverity` indicator.

  The new shape is shared across `ChecklistSummary` (console) and `JsonChecklistEntry`/`JsonReport` (JSON). Console output now renders as `🟢 14 passed. Failed: 🔴 1 error, 🟠 1 warning, 🟡 2 recommendations. Skipped: ⛔ 5 blocked, ⚪ 2 optional` with zero-count entries and empty groups omitted, and combined-summary row icons reflect the worst failed severity per checklist instead of a binary 🟢/🔴 split.

- Add `rdy list` subcommand for local kit enumeration (#23)

  Adds a `rdy list` subcommand that enumerates available kits from the filesystem without loading or executing kit code. Supports two modes: an owner view that loads project config and shows both internal and compiled kits in separate sections, and an external-consumer view (`--local <path>`) that skips config and shows only compiled kits at the target path.

- Add utility functions for common check patterns (#26)

  Adds generic JSON, multi-file, and command-exists utilities to readyup's `check-utils`, giving kit authors ready-made functions for the common "check several things and report what's missing" pattern. Reimplements the package.json helpers as thin wrappers around the new generic forms, eliminating duplicated parsing logic.

### Refactoring

- Extract shared `extractMessage` into `error-handling.ts` (#24)

  Consolidates 20 inline `error instanceof Error ? error.message : String(error)` occurrences across the `readyup` package into a single shared `extractMessage` utility in `src/utils/error-handling.ts`.

## [readyup-v0.13.0] - 2026-04-08

<!-- generated by git-cliff -->
