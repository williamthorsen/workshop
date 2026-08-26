# Changelog

All notable changes to this project will be documented in this file.

## 0.4.0 — 2026-08-26

### 🎉 Features

- Expose a mode-aware outcome label for rendering OverlayResult previews (#405)

  Fixes an issue where an overlay run gave no sign whether it had previewed or applied. `overlay --verify` described drift in the same words an applied run used, so a read-only run read as though it had written the files, and a differing file came with no route to `--force`. Verify now reports what it would do, and offers the route.

  Adds `describeOutcome`, the same wording as a published export, so a consumer composing its own report from an `OverlayResult` draws the preview-versus-applied distinction rather than re-deriving it.

- 🚨 **Breaking:** Rename ScriptsSummary.ran to ranCount (#419)

  Renames the `ran` field of `OverlayResult.scripts` to `ranCount` for clarity.

  Migration: Consumers reading `scripts.ran`, whether from `--json` output or from the `overlay()` return value, read `scripts.ranCount` instead.

### ♻️ Refactoring

- Rename buildEntries to entry-outcomes and cover it and pluralize directly (#409)

  Renames overlay's `buildEntries.ts` to `entry-outcomes.ts` to align with naming conventions. Adds tests for that file and for `pluralize.ts`.

- Conform overlay's names and doc descriptions to the repo conventions (#414)

  Renames `runChezmoi.ts` to `run-chezmoi.ts` and `pendingScripts` to `pendingScriptCount` to align with repo naming conventions. Also revises function descriptions to conform to house style.

### 📚 Documentation

- Apply the comment and plain-speech standard across the overlay package (#417)

  Applies the comment and plain-speech standard to `packages/overlay`, including its README, source comments, and user-facing error messages.

  Also corrects an error message in overlay's launcher, naming `nmr build` as the command to run when the build is missing.

## 0.3.6 — 2026-08-25

### ♻️ Refactoring

- Adopt region folds for module-level helpers (#400)

  Adopts the repo's declaration-order and naming conventions throughout `packages/overlay/src/`. Also deduplicates the chezmoi stubs.

## 0.3.5 — 2026-08-15

### ♻️ Refactoring

- Adopt toolbelt.errors for error-message extraction and cause-chaining (#296)

  Consolidates error-message extraction across the workspace on `@williamthorsen/toolbelt.errors`, replacing the helper `overlay` and `readyup` had each defined for itself along with every inline copy of the same idiom. Failures that wrap a cause now chain through the same library, and lint fails on the inline idiom, naming `describeError` as its replacement. A `catalog:` block in `pnpm-workspace.yaml` becomes the single declaration site for every version more than one manifest declares.

- Regroup overlay's src by role and extend the layout guards (#299)

  Regroups overlay's `src/` root by role. `formatReport.ts` and `formatJsonError.ts` move into a new `reporting/`, `types.ts` into `modes/`, and `utils/pluralize.ts` into `portable/`; `index.ts` and `overlay.ts` stay behind, naming the package rather than a role within it.

  Separately, eslint now rejects a module at the root of overlay's or compositor's `src/`, and the rule barring a `utils` directory widens from readyup alone to every package.

- Adopt toolbelt's captureError and retire every local capture helper (#324)

  Adopts `captureError` from `@williamthorsen/toolbelt.testing` as the standard way to capture an error in tests across the repo, replacing the hand-rolled error-capture helpers.

### 🧪 Tests

- Adopt toolbelt's captureStdio and retire local stdio capture (#326)

  Retires the local `capturedStdio.ts` (and its hand-rolled variants) in favor of `captureStdio` from `@williamthorsen/toolbelt.testing`. Capture is now a `using` declaration per test rather than a `beforeEach` registered for the whole suite.

## 0.3.4 — 2026-08-08

### 🐛 Bug fixes

- Read package versions at run time instead of generating them (#275)

  Fixes an issue where `readyup` and `compositor` could keep reporting an old version after a bump, which also left readyup's warnings about mismatched versions wrong. A fresh install or rebuild is no longer required.

## 0.3.3 — 2026-08-08

### 🐛 Bug fixes

- Name the flag at fault when arguments are rejected (#257)

  Fixes an issue where overlay rejected a command line without naming the flag at fault, whether the flag was unrecognized or was given a value it does not take, and offered advice about passing positional arguments that does not apply to overlay. A single letter written in long form, such as `--h`, is now reported as unrecognized rather than read as the short flag `-h`.

## 0.3.2 — 2026-08-05

### ⚙️ Tooling

- Upgrade nmr, release-kit, and v11y-check (#193)

  Upgrades several dependencies, notably `nmr` to 0.24. That upgrade changes Vitest configuration so that test suites are selected by a tier ("unit", "tool", "localhost", and "remote") corresponding to the services they use. `nmr test:unit` and `nmr test:tool` each run one of these; `nmr test:all` runs every suite. `nmr test:integration` no longer exists, and no tests carry the `.int.` infix. The upgraded `nmr` includes a caching feature that skips checks that already succeeded against an identical working tree.

## 0.3.1 — 2026-08-01

### ⚙️ Tooling

- Migrate to nmr 0.21.0 and the Vitest projects model (#150)

  `nmr test` no longer runs integration tests, and `nmr test:integration` now runs them on their own. Which suite a test file belongs to is decided by its filename suffix: integration tests carry `.int.test.ts`, and a file with any other suffix, or none, is a unit test. Working in this repo now requires Node 24.16.0 or later.

- Enable the Vitest lint plugin and absorb its autofix fallout (#160)

  Adds Vitest-aware lint rules for test files. Errors surfaced by the new rules but not yet addressed have been downgraded to warnings until they can be fixed.

## 0.3.0 — 2026-07-24

### 🪦 Removed

- 🚨 **Breaking:** Require Node 24 and compile at ES2025 (#129)

  `readyup` and `@williamthorsen/overlay` now require Node 24 or later; neither installs or runs on Node 20 or Node 22, which they previously supported. Node 22 is dropped ahead of its April 2027 end of maintenance. Kit authors should rerun `rdy compile` after upgrading, and the resulting kits require Node 24 as well.

### ⚙️ Tooling

- Migrate build to nmr-compile and drop config/build.ts (#105)

  Build maintenance for the monorepo's packages now comes from the shared `@williamthorsen/nmr` toolchain instead of a build script kept inside this repo. The build output and the published packages are unchanged.

### 📦 Dependencies

- Upgrade to TypeScript 6 and migrate to typed ESLint configs (#117)

  Upgrades to the TypeScript 6 and ESLint 10 toolchain.

## 0.2.0 — 2026-06-04

### 🎉 Features

- Add chezmoi-backed overlay CLI with verify/create/force modes (#96)

  Adds `overlay`, a command-line tool (installable as `@williamthorsen/overlay`) that brings a target directory into line with a directory of canonical scaffolding files — adding what's missing, removing what's been marked for deletion, and running any normalization steps. Three modes set how much it will change: `--verify` (the default) reports what's out of sync without touching anything; `--create` brings everything into line except files you've changed locally, which it will not overwrite; and `--force` brings everything into line and overwrites your local changes too. The same behavior is also available as a typed function for use from other TypeScript code.

### ⚙️ Tooling

- Enable public npm publishing for the scoped package (#101)

  Releases of `@williamthorsen/overlay` now publish publicly to npm instead of as a restricted, private package.

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
