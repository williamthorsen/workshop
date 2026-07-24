# Changelog

All notable changes to this project will be documented in this file.

## 0.22.0 — 2026-07-24

### 🎉 Features

- Use the skip emoji for skipped compilations and checks (#107)

  Changes the icon for a skipped kit compilation, and for a check skipped as optional, from a magnifying glass (🔍) to a skip-forward symbol (⏭️).

- 🚨 **Breaking:** Unify n/a semantics and make all report views agree (#130)

  Marking a check not applicable now takes that check and all checks nested beneath it out of the run entirely; they neither execute nor appear in the report. A checklist whose gating precondition was not applicable used to report a clean pass with nothing run; it now runs its checks and can surface real failures. A check whose code crashes now fails the run at error severity, whatever severity it declared. The run summary now describes the whole run: counts, worst severity, and exit code cover everything that happened, not only the severities selected with `--report-on`. Terminal and JSON output now report the same counts, and a check that survives the severity filter stays nested under the checks it sits beneath rather than appearing on its own.

- 🚨 **Breaking:** Differentiate exit codes and route failures through JSON (#133)

  `rdy` now distinguishes kinds of failure by exit code. A run that completes but finds problems in the repo or its kits exits 1; an invocation that `rdy` cannot complete at all -- such as a bad flag, an unreadable configuration, or a kit that will not load -- exits 2. Under `--json`, every failure that produces no report now arrives as a parseable JSON error on stdout; previously some printed prose to stderr, leaving stdout empty.

- Keep partial results when a kit fails after dispatch (#135)

  A run that names several kits no longer discards everything it collected when one of those kits fails: results from every kit that ran are now reported alongside the failure, which names the failed kit and why it failed. Failures are reported this way however many kits a run names, including a run whose only kit fails. A run that exits with code 2 can now carry results rather than none at all, and reading the `--json` output now requires checking whether a kit failed before reading its results.

- Add runtime-alignment primitives to check-utils (#136)

  `readyup/check-utils` now exports functions for checking that a repo's runtime declarations agree with each other. The functions check for the ECMAScript year supported by a Node major version, the minimum Node version required by `engines.node`, the Node version pinned in `.tool-versions`, and the `lib` and `target` values set for TypeScript.

- 🚨 **Breaking:** Formalize and slim the JSON contract (#137)

  The JSON emitted by `readyup` can now be validated against JSON schemas shipped with the package. JSON output now covers `list`, `verify`, and `compile` as well as `run`, and each command puts exactly one document on standard output, with all prose on standard error. Reports are also substantially smaller, and a consumer can now ask for a compact view carrying only the failures and the fixes for them.

  Existing consumers of `rdy run --json` must migrate. The result tallies are now grouped under a single object, the pass indicator is now a verdict rather than a tally, and fields carrying nothing are omitted rather than emitted as null.

- Name bun's install command in a bun-managed project (#141)

  ReadyUp now recognizes bun-managed projects and names bun in the installation instructions. A project that installs with bun is recognized as bun even when it also carries a yarn-format lockfile.

- Validate kits, detect staleness, and settle precondition semantics (#142)

  Kits are now validated when they load, and a malformed check fails the whole kit at both compile and run. Previously such a kit ran, with the bad check silently disabled and unable to fail anything.

  readyup now tracks each compiled kit back to the TypeScript source it was built from. `rdy verify` now fails a kit whose source has been edited without a recompile, and `rdy run` warns when the two have parted.

### 🪦 Removed

- 🚨 **Breaking:** Require Node 24 and compile at ES2025 (#129)

  `readyup` and `@williamthorsen/overlay` now require Node 24 or later; neither installs or runs on Node 20 or Node 22, which they previously supported. Node 22 is dropped ahead of its April 2027 end of maintenance. Kit authors should rerun `rdy compile` after upgrading, and the resulting kits require Node 24 as well.

- 🚨 **Breaking:** Retire case-colliding short flags (#134)

  Removes most short flags from `rdy run` and the `-f` flag from `rdy init`; scripts and aliases using them must switch to the long forms. `--checklists` now filters within whichever single kit is selected, not just when that kit comes from a file or URL.

### 🐛 Bug fixes

- Write an empty manifest for a missing source directory (#114)

  Fixes an issue where `rdy compile` failed when its kit source directory had been removed, such as after deleting all of a project's kits. It now regenerates the manifest with an empty kit list instead of leaving behind one that still lists the removed kits, and recreating the directory as a workaround is no longer required.

- Add remediation hints and improve the first-run experience (#140)

  Fixes a set of `rdy` errors that named the wrong problem or the wrong remedy. A kit that has not been compiled is now reported as needing compilation rather than as missing, and a mistyped command is recognized as a typo instead of a missing kit. When a kit genuinely cannot be found, the error now names the directory searched and the kits that are there. A missing dependency is now reported with the file that needed it and the install command for the project's own package manager, and an unknown-option error now points at the command's help. Listing kits no longer fails when the config file cannot be evaluated, and `rdy --help` now shows examples and points to `rdy <command> --help` for per-command detail.

### ⚙️ Tooling

- Migrate build to nmr-compile and drop config/build.ts (#105)

  Build maintenance for the monorepo's packages now comes from the shared `@williamthorsen/nmr` toolchain instead of a build script kept inside this repo. The build output and the published packages are unchanged.

- Adopt nmr devBin to run rdy from source (#110)

  Developers can now run `rdy`, and the build that relies on it, from a clean checkout: No prior build of the readyup package is required. Previously both failed on a fresh checkout.

### 📦 Dependencies

- Upgrade to TypeScript 6 and migrate to typed ESLint configs (#117)

  Upgrades to the TypeScript 6 and ESLint 10 toolchain.

## 0.21.1 — 2026-06-04

### ♻️ Refactoring

- Migrate CLI parser to node:util.parseArgs (#98)

  Reworks how `readyup` parses command-line arguments, with no change to which flags are accepted or to the guidance shown when a value-taking option is given without its value. Two edge behaviors change: passing an unrecognized option now reports a standard error message instead of the previous custom wording, and grouped single-letter boolean flags (for example, `-jJ`) are now accepted.

### 🧪 Tests

- Stabilize compileConfig esbuild-import-failure test (#97)

  Fixes intermittent failures in the readyup test suite, where a set of test cases failed roughly one run in twelve regardless of the code under test. The suite now passes reliably, so a green branch no longer fails the gate on an unlucky run.

## 0.21.0 — 2026-05-18

### 🎉 Features

- 🚨 **Breaking:** Externalize readyup from compiled kit bundles (#88)

  Compiled `readyup` kits no longer inline the `readyup` package. Imports of `readyup` and `readyup/<subpath>` survive in the compiled output as live specifiers and resolve at run time through the `rdy` runner's own installation.

  The `rdy` runner remains the authoritative source of `readyup` for kits it runs — whether invoked via `npx readyup`, `rdy run --from github:…`, a global install, or any other entrypoint. Kits do not need `readyup` as a project dependency, which preserves use cases where readyup is run against environments with no `package.json`.

  🚨 **Breaking:** Node 20.6 or later is now required (was Node 18.17 or later). The `module.register()` API the runner depends on becomes stable at Node 20.6.

- 🚨 **Breaking:** Move check-utils to dedicated subpath export (#89)

  Check utilities now import from a dedicated `readyup/check-utils` subpath rather than the `readyup` package root. Kit authors must split imports: authoring helpers stay on `readyup`; check utilities like `fileExists` and `discoverWorkspaces` move to `readyup/check-utils`.

  `readyup/check-utils` is the stable surface for these imports. After upgrading readyup across a major boundary, recompile kits with `rdy compile` so newly-shipped or changed check utilities are picked up.

- Embed compile-time readyup version and warn on runtime skew (#90)

  The `rdy` runner now prints an advisory when a compiled kit was built against a different readyup version than the one running it. `rdy list` displays the readyup version against which each kit was compiled.

  When `rdy compile`'s batch mode encounters an unreadable manifest, it now surfaces the error and proceeds as if the manifest were absent. Previously these failures were swallowed silently.

## 0.20.0 — 2026-05-04

### 🎉 Features

- Add `rdy list --from github:` remote kit listing (#76)

  Adds support for listing kits from a remote GitHub repository via `rdy list --from github:org/repo[@ref]`. The command fetches the manifest from `raw.githubusercontent.com`, validates it against the manifest schema, and renders the kit list in the same format as the local `--from` modes. A `GITHUB_TOKEN` (when present) is forwarded as `Authorization: token …` so private and rate-limited public repos work without extra configuration. Missing manifests, malformed responses, and network failures all produce actionable error messages with the URL in context.

- Add `rdy list --from bitbucket:` remote kit listing (#80)

  Adds support for listing kits from a remote Bitbucket Cloud repository via `rdy list --from bitbucket:workspace/repo[@ref]`. The command fetches the manifest from Bitbucket's documented file-source API endpoint, validates it against the manifest schema, and renders the kit list in the same format as the `--from github:` and local modes. When `BITBUCKET_TOKEN` is set, the request is authenticated as `Authorization: Bearer …` so private and rate-limited public repos work without extra configuration; without a token, public repos still work anonymously.

- Add `rdy run --from bitbucket:` private-repo support (#82)

  Adds support for fetching kits from private Bitbucket repositories with `rdy run --from bitbucket:`. When `BITBUCKET_TOKEN` is set, the request authenticates as that token; when unset, requests go anonymous and continue to work for public repos as before.

  Improves error reporting for all remote kit sources by always including the source URL in stderr, even when the underlying failure (such as a network rejection) carries no URL of its own. This brings `rdy run` to parity with `rdy list`.

### ♻️ Refactoring

- Generalize `loadRemoteKit` to headers-based auth (#81)

  Generalizes the `loadRemoteKit` helper used by `rdy run` to fetch remote kit files: the GitHub-specific `token?: string` option is replaced with a scheme-agnostic `headers?: Record<string, string> | undefined`. Callers now pre-format their own `Authorization` header (and can add proxy or telemetry headers as needed). Behavior for `rdy run --from github:org/repo` is unchanged.

## 0.19.0 — 2026-04-24

### 🎉 Features

- Add `discoverWorkspaces` check-util for monorepo-aware kits (#74)

  Adds `discoverWorkspaces()` to readyup's `check-utils`, a single helper that enumerates a repo's workspaces across pnpm, npm/yarn, and single-workspace layouts with a uniform return shape. Consumer kits can now answer workspace-iteration questions — including "does this repo have anything publishable?" as `discoverWorkspaces({ filter: (w) => w.isPackage }).length > 0` — without bundling their own `glob` + YAML-parser combination.

## 0.18.0 — 2026-04-23

### 🎉 Features

- Detect drift between manifest and compiled kits (#65)

  Adds drift detection for compiled readyup kits so manual or accidental edits to generated `.js` files can no longer be silently erased by `rdy compile`.

  Adds a new `rdy verify` subcommand that audits the manifest on demand without mutating anything, reporting each kit as `ok`, `drift`, `missing`, or `unverified` and exiting non-zero when any kit has drifted or is missing.

- Add isGitRepo, isAtRepoRoot, and expandHome helpers (#72)

  Adds three generic git-path helpers to `readyup`'s `check-utils/git` subpath:

  - `isGitRepo(path)` returns `true` when the path is inside a git working tree (subdirectories and worktrees count).
  - `isAtRepoRoot(path)` returns `true` only when the path is the top of a working tree, using `git rev-parse --show-cdup` to avoid the path-comparison pitfalls of `--show-toplevel`.
  - `expandHome(path)` expands a leading `~` or `~/` to the user's home directory. Previously this existed as a private `expandTilde` inside `run-git.ts`; it is now exported under a more general name so consumers can reuse the same tilde handling that `runGit` uses internally.

### 🐛 Bug fixes

- Allow explicit undefined on optional authoring-type fields (#69)

  Fixes an issue where TypeScript consumers of `readyup` with `exactOptionalPropertyTypes: true` could not use idiomatic factory patterns to construct public authoring types. No runtime behavior changes.

## 0.17.0 — 2026-04-17

### 🎉 Features

- Add git freshness check utilities (#50)

  Adds git freshness check utilities to readyup's `check-utils` module, enabling kits to verify branch sync state (local-to-local and local-to-remote) without hand-rolling git subprocess calls. The new utilities return discriminated-union results for type-safe status handling and provide check factories with git-status-style diagnostic messages.

- Add manifest schema and `rdy compile` manifest generation (#54)

  Adds a `.readyup/manifest.json` file that is automatically generated on every `rdy compile` invocation, providing machine-readable kit discovery for external consumers. Batch mode writes the full manifest; single-file mode upserts a single entry. A new `rdy list --manifest` flag reads and displays manifest contents. Kit authors can now supply an optional `description` that flows through to the manifest.

- Enable cross-directory kit discovery via manifest (#56)

  Enables `rdy list` to discover compiled kits across directory boundaries by reading location data from the manifest instead of scanning the filesystem. `rdy compile` now records each kit's compiled path, source path, and a content hash in the manifest, making cross-directory resolution possible without filesystem traversal

### 🐛 Bug fixes

- Prevent authoring deps from being bundled into compiled kit (#61)

  Restores compiled kit bundles produced by rdy compile to their pre-regression size of ~7 KB, eliminating a 76× bloat (~526 KB) where every compiled kit silently inlined the entire zod library and its locale files.

### ♻️ Refactoring

- Skip config load for external source flags in `handleRun` (#48)

  Aligns `rdy run` with the rule established by `rdy list`: when an external source flag (`--from`, `--file`, `--url`) is active, project config is not loaded. Makes `internalDir` and `internalInfix` optional in `resolveKitSources`, making the API contract explicit.

### 🧪 Tests

- Add integration test for `pickJson` compile pipeline (#49)

  Adds an integration test that exercises the full `pickJson` compile pipeline — plugin registration, JSON inlining, runtime stub elimination, and valid ESM output — using real fixture files and `compileConfig`.

## 0.16.0 — 2026-04-13

### 🎉 Features

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

### 🐛 Bug fixes

- Update list hints and README to use positional kit syntax (#43)

  Fixes the `rdy list` output to show positional kit syntax (`rdy run --jit [<name>]` for internal, `rdy run [<name>]` for compiled) instead of the stale `--kit <name>` flag syntax. Rewrites the README CLI reference to document all current flags, the five `--from` source types, and the `list` command.

## 0.15.0 — 2026-04-11

### 🎉 Features

- Add `computeHash` and `fileMatchesHash` check utilities (#28)

  Adds hash-based file comparison to the check-utils module for detecting drift in configuration files. `computeHash` is a pure function returning a SHA-256 hex digest via `node:crypto`. `fileMatchesHash` composes `readFile` + `computeHash` for ergonomic use in kit checks, returning `false` for missing files consistent with `fileContains`.

- Add `safeJsonParse` utility for safe JSON parsing (#29)

  Adds a reusable `safeJsonParse` utility that wraps `JSON.parse` in a try/catch, returning `undefined` on invalid input instead of throwing. Refactors the existing `readJsonFile` check utility to use it, eliminating inline error handling.

## 0.14.0 — 2026-04-11

### 🎉 Features

- Make summary counts severity-aware (#14)

  Replaces readyup's three-bucket `passed`/`failed`/`skipped`/`allPassed` summary model with a granular `SummaryCounts` shape that tracks failures by severity (`errors`, `warnings`, `recommendations`), skips by reason (`blocked`, `optional`), and carries a `worstSeverity` indicator.

  The new shape is shared across `ChecklistSummary` (console) and `JsonChecklistEntry`/`JsonReport` (JSON). Console output now renders as `🟢 14 passed. Failed: 🔴 1 error, 🟠 1 warning, 🟡 2 recommendations. Skipped: ⛔ 5 blocked, ⚪ 2 optional` with zero-count entries and empty groups omitted, and combined-summary row icons reflect the worst failed severity per checklist instead of a binary 🟢/🔴 split.

- Add `rdy list` subcommand for local kit enumeration (#23)

  Adds a `rdy list` subcommand that enumerates available kits from the filesystem without loading or executing kit code. Supports two modes: an owner view that loads project config and shows both internal and compiled kits in separate sections, and an external-consumer view (`--local <path>`) that skips config and shows only compiled kits at the target path.

- Add utility functions for common check patterns (#26)

  Adds generic JSON, multi-file, and command-exists utilities to readyup's `check-utils`, giving kit authors ready-made functions for the common "check several things and report what's missing" pattern. Reimplements the package.json helpers as thin wrappers around the new generic forms, eliminating duplicated parsing logic.

### 🐛 Bug fixes

- Normalize CLI output alignment with uniform-width icons (#17)

  Replace the two narrow `ICON_SKIPPED_*` constants in `reportRdy.ts` with their 2-cell-wide counterparts (⚪ → 🔍 and ⛔ → 🚫), bringing the entire icon set to a uniform terminal cell width. Increase the per-depth nesting indent and the continuation-line lead-in from 2 to 3 spaces each. Wire `compileCommand.ts` to import `ICON_SKIPPED_NA` from `reportRdy.ts` under a local alias `ICON_NO_CHANGES`. Migrate icon-using test assertions across three test files to reference imported constants instead of raw Unicode escape sequences.

### ♻️ Refactoring

- Extract shared `extractMessage` into `error-handling.ts` (#24)

  Consolidates 20 inline `error instanceof Error ? error.message : String(error)` occurrences across the `readyup` package into a single shared `extractMessage` utility in `src/utils/error-handling.ts`.

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
