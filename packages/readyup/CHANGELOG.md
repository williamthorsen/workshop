# Changelog

All notable changes to this project will be documented in this file.

## 0.31.0 — 2026-08-23

### 🎉 Features

- Exempt the publishing package's own source from its adoption checks (#378)

  Adds `ownImplementation` to `buildFindingReport` in `readyup/check-utils`. When a file in the package's own source exports one of that package's recommended exports, that file is no longer flagged as a candidate to use it. The exemption is file-scoped, so other files in the package are not exempt from the check.

- Widen `readyup/check-utils` to absolute paths and reconcile workspace discovery's `cwd` (#379)

  Widens the path readers of `readyup/check-utils` (`fileExists`, `readFile`, and `filesExist`, and every reader layered on them) to accept an absolute path, which now names the file itself. A relative path resolves against `cwd` exactly as before. An absolute path used to be appended to `cwd`, producing a path that never existed, so these readers silently returned nothing.

  Reconciles the helpers behind `discoverWorkspaces` with the directory they are handed: each now reads its manifests there rather than through the ambient `cwd`.

- Let a source decline a finding with an `rdy-ignore` pragma (#380)

  Adds an `rdy-ignore` pragma that can be included in a comment to decline a ReadyUp finding: `rdy-ignore` covers the line it sits on; `rdy-ignore-next-line` covers the line below it. A declined finding is excluded from the report.

  A pragma without an argument covers every check for the line. The pragma accepts a comma-separated list of check IDs, but narrowing is not yet implemented. A trailing `-- <reason>` is optional.

- 🚨 **Breaking:** Let a pragma name the check whose finding it declines (#381)

  Now supports check IDs in `rdy-ignore` comments, so that a comment can suppress a single check on a line instead of every check.

  Migration: `buildFindingReport` now returns a `FindingOutcome` instead of a `CheckOutcome`. The runner turns that value into the verdict, the detail, and the fraction. A kit that returns it unchanged needs no edit.

- Report a pragma that declined nothing (#384)

  Adds `pragma-unused`, a warning `rdy run` prints for each `rdy-ignore` pragma that declined no finding in the run.

  readyup can only warn about files it knows a check read, so `FindingOutcome` gains a `scanned` field where a check lists the paths it read. Only `.ts` and `.js` files a check reported reading are searched for dead pragmas.

  No kit sets `scanned` yet, so nothing warns today. #385 will record what a check read automatically, so no kit has to declare anything.

- Record a check's sweep without asking it to declare one (#387)

  The sources read by a check through `readTrackedSources` are now recorded, providing an automatic way to gather the evidence needed for the `pragma-unused` warning. A check that reads files some other way declares them in `FindingOutcome.scanned`, and those paths are recorded too.

### ♻️ Refactoring

- Say a pragma suppresses a finding, not declines it (#388)

  Renames readyup's pragma vocabulary from `decline` to `suppress` across `packages/readyup`: the `rdy-ignore` prose in the README and the kit rulebook, the run layer's identifiers and doc comments, and the `pragma-unused` warning, which had not yet been released. Where the same word described a check that skipped, in the ⚪ legend of both documents, it becomes "does not apply".

### 📦 Dependencies

- Upgrade the `toolbelt.*` packages and adopt `isError` (#383)

  Upgrades four `@williamthorsen/toolbelt.*` packages: `errors`, `filesystem`, `packaging`, and `vitest`. `TempTree.symlink` now stores its target as given rather than rewriting it to an absolute path inside the tree, and ReadyUp's affected caller passes `tree.resolve` to keep the link it had.

  ReadyUp now narrows thrown values with `isError` from `@williamthorsen/toolbelt.errors`, replacing inline `instanceof Error`. Inline error coercers have been consolidated into a common `toError` function.

  Also fixes an issue where a kit throwing a value with no string rendering, such as a null-prototype object, crashed the run instead of being reported as an authoring error.

## 0.30.0 — 2026-08-19

### 🎉 Features

- Bundle kit-authoring guidance with readyup (#365)

  Adds kit-authoring guidance to `readyup`, published in the package as a CodeAssembly content root and installed as the `consult-readyup-kits` skill by any repo that names `readyup` under `packages` in its `.agents/codeassembly.yaml` and runs `codeassembly sync`. The guidance states when a check should skip rather than pass, which structures collapse a group of skips, and when a `fix` getter is appropriate. `rdy --help` and the kit scaffolded by `rdy init` both point at it, and the README carries the same doctrine under a new `When a check skips` heading.

- Add the `rdy help` command with README-backed topics (#366)

  Adds `rdy help [<command|topic>]` to readyup. Given a command, it prints that command's help; given one of five topics (`authoring`, `concepts`, `json`, `publishing`, `utils`), it prints the matching section of the shipped README. `rdy --help` now displays the topic list.

- Add `rdy list --packages`, a listing of the kits a project's dependencies publish (#367)

  Adds `rdy list --packages` to `readyup`, which lists the working directory's kit-publishing dependencies as one block per package. The set is every installed direct dependency that publishes kits plus every package the config's `packages` list names. Under `--json`, every package-published kit row now carries `origin.configured`.

- Add `rdy list --recursive --packages`, the repo-wide dependency view (#368)

  Adds `rdy list --recursive --packages`, which reports every workspace below the working directory with the kit-publishing dependencies it declares and the kits each publishes. Each workspace is read under its own `package.json` and its own readyup config, and its run hint begins with the `cd` that reaches it, so every command works from where the sweep began.

  Separately, every listing view now labels its command hint `To run: <command>`, and a package the config omits is marked `not listed in the readyup config` in place of `not configured`.

- Add `blankNonCode` and `getLineAtOffset` to `readyup/check-utils` (#373)

  Adds `blankNonCode` and `getLineAtOffset` to `readyup/check-utils`, the two text primitives a conformance kit's detector needs to tell a site in code from an idiom written in a comment or a string. `blankNonCode` replaces every comment and every literal's text with spaces while preserving the source's length and every line-break position, so an offset found in the blanked text names the same line in the source a reader opens. It reads JavaScript-family syntax.

  Separately, `countPackageUsage` no longer counts a call written in a comment or a literal, nor treats a source that only quotes an import of the package as one making it.

### ♻️ Refactoring

- Consolidate workspace discovery onto the shared directory walker (#371)

  Consolidates `readyup`'s workspace discovery onto `walkDirectories`, the shared directory walker, deleting the private recursive walk that `discoverWorkspaces` carried alongside it.

  A workspace directory that cannot itself be listed is now dropped along with its subtree, where before it survived by being matched from its parent's listing. That brings `discoverWorkspaces` into line with `discoverProjects`, which already swept the tree this way.

### 🧪 Tests

- Move the `route.*` suites onto toolbelt's temp tree and cwd pointer (#361)

  Moves the five `route.*` suites in the `readyup` package off the local `useTempDir` helper and onto toolbelt's utilities: `createTempTree` for the file-scoped tree, `pointCwdAt` for moving the process into it, and `makeFixture` for binding the tree as a Vitest fixture. The helper survives for the eighteen suites not yet migrated, which follow before it is deleted.

- Reshape `useFailingDirectoryRead` and move its suites onto fixtures (#362)

  Moves the `discoverKitProjects`, `list --recursive`, and `walkDirectories` suites onto `createTempTree` fixtures, so each test reaches its tree as a parameter rather than through a module-level handle. Reshapes `useFailingDirectoryRead` to take the tree's root rather than a thunk resolving it, and folds the reader's reset into binding, which retires `passAllReads`. Both suites that point the working directory reach it through `pointCwdAt` rather than a `process.cwd` spy.

- Move three `readyup` test suites onto toolbelt's temp trees (#363)

  Moves three `readyup` test suites off the package's own `useTempDir` helper onto `createTempTree` from `@williamthorsen/toolbelt.filesystem`. The `discoverKitPackages` and `expandConfiguredPackages` suites take their trees as `test.extend` fixtures declared as literal entry maps; the `pnpmWorkspaceYaml` suite builds a tree per test.

- Delete `useTempDir` and move its suites onto toolbelt tree fixtures (#364)

  Deletes `packages/readyup/src/test-utils/tempDir.ts` and moves its remaining consumer suites onto toolbelt's `createTempTree` and `pointCwdAt`, reached through a per-test `makeFixture` fixture. `readyup` no longer carries a temporary-directory helper of its own.

  Separately, narrows `eslint.config.ts`'s vitest suppression block to exact filenames, replacing two globs that reached files needing no suppression.

## 0.29.0 — 2026-08-17

### 🎉 Features

- Add adoption-kit support to `check-utils` (#351)

  Adds four utilities to `readyup/check-utils` for kits that audit a project's own sources: `listTrackedFiles`, `readTrackedSources`, `countPackageUsage`, and `buildFindingReport`. A file is read at most once per process however many kits select it, and the listing behind it is built once for the checks a run starts together. Both readers return `undefined` outside a git working tree.

- Add `--diagnose`, which reports skipped checks that would have passed (#354)

  Adds `rdy run --diagnose`, which runs the `check` of each skipped check and reports the ones that would have passed. It reports them as two new warnings, `skip-masks-pass` and `diagnosis-inconclusive`, written to stderr in both output modes and listed under `warnings` in JSON; statuses, counts, durations, and the exit code are the same as a run without the flag. The flag is off by default because it runs checks that a kit author chose to skip, and such a check may reach a network or a registry.

### 🐛 Bug fixes

- Resolve a check's `fix` only where a failure renders it (#345)

  Fixes the issue that `rdy compile` could delete a just-compiled kit if the kit included a `fix` whose value was a getter that throws. A `fix` written as a data property is still validated as a string at load. A getter that throws or yields a non-string reports `Unresolvable fix: ...` in that failure's remediation slot, keeping the check's own status and declared severity.

### ⚡ Performance

- Memoize workspace discovery so one run walks the tree once (#332)

  `discoverWorkspaces` now scans a repository's workspace layout once per run and reuses the result, rather than rescanning for each check that calls it. The walk costs 3.7 ms in a 19-workspace repository, and one `rdy run --packages` ran it eight times; it now runs once.

  The `Workspace` values a run returns are shared across it, frozen along with their `packageJson`, so a kit that writes to one raises a `TypeError`. A workspace added or removed mid-run is not reported in the results.

### 🧪 Tests

- Adopt toolbelt's `silenceConsole` and retire the hand-rolled console spies (#340)

  Adopts `silenceConsole` from `@williamthorsen/toolbelt.vitest` to replace every hand-rolled `vi.spyOn(console, …)` spy in the repo. The function returns a disposable, so a test binds it with `using` and the console methods it named are restored at the end of the test scope.

  `@williamthorsen/toolbelt.vitest` is added to the ReadyUp configuration; `rdy run --packages` runs the kit bundled with the new package along with other kits.

- Move readyup's remaining stdio spies onto captureStdio (#341)

  Completes the adoption of `captureStdio` from `@williamthorsen/toolbelt.testing` for stdio capture in tests, eliminating all remaining uses of `process.stdout` and `process.stderr` write spies.

## 0.28.0 — 2026-08-15

### 🎉 Features

- Record the compile's input closure in the manifest (#317)

  `rdy compile` now records every file it read into a kit's bundle -- each module the kit imports, and each JSON file `pickJson` drew from -- with a hash of each, on the kit's manifest entry. Only the entry `.ts` and the emitted `.js` were hashed before, so an edit to an inlined module or a picked JSON value left a stale bundle with both recorded hashes still matching. Nothing reads the new record yet; turning it into a staleness verdict comes next.

  A `pickJson` input hashes only the values the kit drew, so an unrelated edit to the same file -- another `package.json` script, say -- does not read as staleness. The record stops at `node_modules`, whose contents the lockfile already pins.

- Verify and warn on a stale compile input (#319)

  Adds a third check to `rdy verify`. Alongside the kit's source and its compiled bundle, verify now re-reads every file the compile consumed -- helper modules the bundle inlined, and JSON values `pickJson` copied in -- and fails when any of them has changed since the build. Editing one of those files moves neither recorded hash, so until now verify reported `ok` on a bundle built from ingredients that no longer existed.

  Verification names every input that failed, separating a changed file from one that is gone and from one whose picked field has vanished. `rdy run` gains a matching `input-stale` advisory, and both reach `--json` at `schemaVersion` 1.

- Check recorded inputs in ReadyUp's own freshness checklist (#321)

  The `freshness` checklist now checks all files bundled into a compiled kit to determine whether the compilation is fresh or stale. For a package that publishes its kits, a bundle stale in one of those files now fails the check.

  `readyup/check-utils` gains `projectJsonFile` and `describeJsonProjectionFailure`, which a kit can use to read and report on the JSON values a compile inlined.

- Record the compile's toolchain so a rebuild mismatch names its cause (#322)

  Improves ReadyUp's ability to diagnose why a kit is reported stale. `rdy compile` now records the esbuild that built each kit and every package the bundle inlined, as `esbuildVersion` and `bundledDependencies` on the kit's manifest entry. On a mismatch, `rdy verify --rebuild` compares them to newly computed values and reports which versions changed, or that none did. Plain `rdy verify` works as before.

### ♻️ Refactoring

- Group readyup's flat src/ root by role (#292)

  Reorganizes the files in the `readyup` package for better usability and maintainability. Functions are now grouped by domain.

- Adopt toolbelt.errors for error-message extraction and cause-chaining (#296)

  Consolidates error-message extraction across the workspace on `@williamthorsen/toolbelt.errors`, replacing the helper `overlay` and `readyup` had each defined for itself along with every inline copy of the same idiom. Failures that wrap a cause now chain through the same library, and lint fails on the inline idiom, naming `describeError` as its replacement. A `catalog:` block in `pnpm-workspace.yaml` becomes the single declaration site for every version more than one manifest declares.

- Regroup readyup's utils modules by role (#298)

  Regroups readyup's source one level below `src/`. The six modules in `utils/`, which shared nothing but their arrival time, disperse to `portable/`, `installed-packages/`, and a new `severity/`; `packages/` becomes `installed-packages/`, its old name having repeated the repo's own workspace root. An eslint rule now rejects a `utils` directory anywhere under `packages/readyup/src/`.

- Split argument parsing out of the run command (#304)

  Extracts `parseRunArgs` and its flag-validation collaborator out of `readyup`'s `src/run/runCommand.ts` into modules of their own: `parseRunArgs.ts` and `validateRunFlags.ts`. `validateRunFlags` (formerly the private `validateFlagConstraints`) takes a narrow `RunFlagConstraints` view of the parsed flags rather than the parser's whole output.

  The constraint matrix is now exercised directly against `validateRunFlags` rather than through the parser, covering combinations the indirection left untested, such as `--internal` with `--packages`.

- Split kit-source resolution out of the run command (#305)

  Extracts kit-source resolution from `readyup`'s `src/run/runCommand.ts` into five modules named for what they export, one each for the source-flag branch, the `--from` switch, the `--packages` expansion, and the two symbols both sides of that edge read. `runCommand.ts` keeps the execution path alone and imports the resolved-entry type rather than declaring it.

  Each new module's tests call it directly and mock nothing. `resolveConfiguredPackages` gains a test file of its own, the `--packages` branch having had none outside the wiring test, which in turn sheds the five cases those unit tests now cover.

- Extract the run command's shared execution kernel (#306)

  Extracts five declarations out of `readyup`'s `src/run/runCommand.ts` into modules of their own: `loadKit.ts`, `kit-staleness.ts`, `resolveRunExitCode.ts`, `resolveThresholds.ts`, and `selectChecklists.ts`. Calling the extracted functions directly reaches guards a `--jit` run could not.

- Split the run command's output modes into their own modules (#307)

  Splits `readyup`'s `runCommand.ts` into three modules: `runJsonMode.ts` and `runHumanMode.ts` take the two output modes along with their rendering helpers and module-private types, leaving `runCommand.ts` with `RunCommandOptions` and the `json` dispatch.

- Adopt toolbelt's captureError and retire every local capture helper (#324)

  Adopts `captureError` from `@williamthorsen/toolbelt.testing` as the standard way to capture an error in tests across the repo, replacing the hand-rolled error-capture helpers.

### 🧪 Tests

- Cover every kit provenance in human-mode block headings (#308)

  Adds missing tests to expand test coverage of `describeKitProvenance` and `runHumanMode.ts` to 100%.

- Adopt toolbelt's captureStdio and retire local stdio capture (#326)

  Retires the local `capturedStdio.ts` (and its hand-rolled variants) in favor of `captureStdio` from `@williamthorsen/toolbelt.testing`. Capture is now a `using` declaration per test rather than a `beforeEach` registered for the whole suite.

### 📦 Dependencies

- Catalog esbuild and declare the peer in devDependencies (#310)

  Declares `esbuild` as a dev dependency of `readyup`, making the peer dependency explicit. Moves the version specification of `esbuild` (also used by the root) to a pnpm catalog.

### 🤖 Agentic support

- Migrate project guidance to the repo-root AGENTS.md (#294)

  Project guidance is updated and moved from .agents/PROJECT.md to AGENTS.md at the repository root. Stale guidance has been removed. Guidance on use of the `nmr` task runner has been removed in deference to the guidance bundled with `nmr` itself.

## 0.27.0 — 2026-08-10

### 🎉 Features

- Export discoverKitPackages from readyup/check-utils (#282)

  `readyup` now exports a `discoverKitPackages` function, which allows a kit to list direct dependencies in the target repo that publish ReadyUp kits.

- Compile kits under readyup's declared TypeScript settings (#284)

  Kit compilation no longer reads the host repository's TypeScript configuration. Kits now compile under a fixed, documented set of settings, so the same kit source compiles to identical bytes in every repository. A kit that imports through a TypeScript path alias no longer compiles; kit imports must now be relative paths or package specifiers.

- Add a run-wide summary table to multi-kit runs (#287)

  A `rdy run` command that runs more than one kit now ends with a summary table: one row for every checklist that ran, and a total across all of them. A failing row points at the output block that explains it. The table is no longer suppressed if a kit fails to load.

- Thin quiet-mode output and settle one grammar for run blocks (#288)

  A `rdy run` filtered with `--quiet` or `--report-on` no longer gives a block of its own to a checklist that has nothing left to report; the run's summary table accounts for it instead. An 11-checklist run that reported 11 blocks now reports 2. What remains reads the same way filtered or not. The total is now labeled to avoid visual confusion with checks.

### 🐛 Bug fixes

- Stop failing a kit-less project, and report check details as sentences (#278)

  Fixes the issue that a project that had `readyup` installed but no kits at its root was flagged as defective. Separately, the guidance on writing good kits now encourages the use of full-sentence messages for clarity, and ReadyUp's own kits have been revised accordingly.

- Exempt a workspace specifier from the version floor (#283)

  Fixes an issue where a minimum-version check reported a repository as running an outdated version of a package that the repository builds itself. `hasMinDevDependencyVersion` now includes this exemption automatically, and kit authors can remove any custom checks to exempt `workspace:` from version requirements.

### ♻️ Refactoring

- Align ReadyUp's test layout and barrel imports with the layout rules (#286)

  Importing a single JSON payload type no longer pulls in every schema module alongside it.

  Test helpers are now included in coverage measurement. Test files are reorganized to follow the in-house file structure and naming conventions.

## 0.26.0 — 2026-08-08

### 🎉 Features

- Run only the default kit under `--packages` unless a kit is named (#274)

  `rdy run --packages` now accepts positional arguments specifying the kits to run. Without positional arguments, `rdy run --packages` now runs only the kit named `default` (if it exists) from each package listed in the configuration.

- Separate run verdict from counts and lead with failures (#276)

  Refines readyup's human-readable report to distinguish the verdict for a run from the counts for each kind of result. Counts now lead with errors instead of passes.

### 🐛 Bug fixes

- Read package versions at run time instead of generating them (#275)

  Fixes an issue where `readyup` and `compositor` could keep reporting an old version after a bump, which also left readyup's warnings about mismatched versions wrong. A fresh install or rebuild is no longer required.

## 0.25.0 — 2026-08-08

### 🎉 Features

- Add repo-wide kit discovery with rdy list --recursive (#253)

  Adds a recursive option to ReadyUp's list command. `rdy list --recursive` reports the kits across an entire repository in a single pass. The listing groups kits by containing project, shows the description each project records for its kits, and pairs each group with the command that runs those kits from the current directory.

- Follow package-specifier extends when reading a tsconfig's language level (#265)

  A check that asserts a project's effective TypeScript language level now gets an answer when the project inherits that level from a base config installed as a package, not only from a config file within the project itself. Such a project previously reported no language level at all, indistinguishable from one that declares none. A base config that still cannot be reached is reported as unresolved rather than as an absent setting.

- Report each kit's compile-time readyup version in JSON output (#267)

  `rdy run --json` now reports which version of `readyup` compiled each kit. No version appears for kits built by older `readyup` versions that did not record it, or for kits run from TypeScript source under `--jit`.

- Decide kit compatibility by what a kit imports (#269)

  A kit incompatible with the version of `readyup` attempting to run it now fails before any check runs, naming the reason and available corrective action. Previously, no guard prevented such kits from running, and a kit could falsely report success. ReadyUp no longer warns about harmless version differences between the `readyup` version that compiled a kit and the one running it.

- Expose the resolved tsconfig extends chain with each config's own declarations (#273)

  ReadyUp now enables kits to determine which config in a tsconfig's `extends` chain declared a given setting. Previously, only the chain's effective language level could be determined. The kit can also distinguish a first-party base config from a third-party framework base, even when the same published config sits at different paths from one install to the next.

### ♻️ Refactoring

- Report causes of read, parse, and load failures; fix lint (#260)

  A failure to read a manifest, parse a remote manifest, or load a compiled kit now names the permission denial, syntax error, or module failure that caused it.

  Also fixes lint violations and removes severity downgrades for the associated rules.

- Migrate to the shared tsconfig (#266)

  Adopts `@williamthorsen/tsconfig` as the standard TypeScript configuration for this repo, replacing the previous hand-maintained copy. Reading a property through an index signature now requires bracket notation or a type that declares the property. Explicit resource management (`using` and `await using`) can now be used.

### 🧪 Tests

- Clear readyup's Vitest lint violations and enforce the rules (#258)

  Fixes deferred violations of Vitest lint rules in the readyup package and restores the severity of the associated rules to "error" when a strict-lint check is run.

### 👷 CI

- Enforce kit-bundle freshness in the quality gate (#272)

  Adds `rdy verify --rebuild` to the repo's quality gate, which now fails when a committed kit bundle has fallen out of date with the installed `readyup`; `rdy compile` clears the failure.

## 0.24.0 — 2026-08-05

### 🎉 Features

- Ship ReadyUp's own kits (default and publishing) (#174)

  `readyup` now ships with two kits that can be run directly from the installed package. `rdy run --from npm:readyup` reports on whether the consuming project's kits are set up correctly and advises fixes. `rdy run --from npm:readyup publishing` checks the readiness of the project's kits for publishing, exiting with an error if checks fail. `rdy list --from npm:readyup` lists the available kits.

- Suggest a credential when a private-repo fetch is refused (#211)

  Adds a hint to the message that `readyup` displays when a remote kit cannot be fetched because a credential is missing. The previously uninformative message is replaced by a message appropriate for the target host (Bitbucket or GitHub). A corresponding `hint` field is added to JSON output when the `--json` option is used.

- Add rdy verify --rebuild to check a kit by recompiling it (#237)

  Adds a `--rebuild` flag to `rdy verify`, which causes the verification to check whether an existing compiled kit bundle exactly matches what its source produces. Previously, a kit was checked only against recorded hashes of its source and its compiled bundle, so a kit could be reported current even if an imported module or inlined data had changed.

  The `--rebuild` flag requires `esbuild`. Because a bundle carries the version of `readyup` that compiled it, upgrading `readyup` makes untouched kits fail until they are recompiled.

- Head every rdy block with a source-first breadcrumb (#240)

  Improves `rdy` output in several ways:

  - more clearly labels `rdy run` output to show the source of the checks being run
  - more clearly labels `rdy compile` output to show the location of kits being compiled
  - adds emojis to identify 🌐 host, 📦 package, 🧰 kit, and 📋 collection
  - removes unneeded blank lines in output

- Let a check declare that it reports only when it fails (#242)

  Kit authors can now mark a check to report only when it fails or is skipped.

- Stop creating a manifest in projects that have no kits (#247)

  Changes the behavior of `rdy compile` so that it no longer creates a manifest if no kits are found to compile. This allows `rdy compile` to be run recursively in a monorepo that has kits in only some workspaces; previously, that operation would have created an empty manifest in workspaces that didn't need one.

  A run that finds no kits now reports whether a manifest was written. In a project with no kits, `rdy verify` now reports a missing manifest.

### 🐛 Bug fixes

- Keep the kit heading from reading as a failure (#244)

  Replaces the 🧰 Toolbox emoji representing kits in `rdy` output with 📓 Notebook emoji. At a glance, the Toolbox emoji's bright red color gave the false impression that a failure had occurred.

### ♻️ Refactoring

- Share temp-directory and stdio scaffolding across test suites (#178)

  Refactors test code to use shared helpers to create a temporary working directory or capture command output; the helpers handle directory cleanup, working-directory redirection, and stream restoration automatically.

- Embed the tier in test file names (#195)

  Every test file now embeds the name of its tier (unit, tool, localhost, or remote), and the naming convention is enforced by a CI check. Tests that use tools outside the test process can now be run separately (`nmr test:tool`).

### ⚙️ Tooling

- Upgrade nmr, release-kit, and v11y-check (#193)

  Upgrades several dependencies, notably `nmr` to 0.24. That upgrade changes Vitest configuration so that test suites are selected by a tier ("unit", "tool", "localhost", and "remote") corresponding to the services they use. `nmr test:unit` and `nmr test:tool` each run one of these; `nmr test:all` runs every suite. `nmr test:integration` no longer exists, and no tests carry the `.int.` infix. The upgraded `nmr` includes a caching feature that skips checks that already succeeded against an identical working tree.

### 📚 Documentation

- Make readyup's shipped exemplars follow the naming and detail contracts (#219)

  Revises ReadyUp's starter template, demo, editor tooltips, and documentation so that they all align with ReadyUp's own check-authoring contract.

  New features:

  - Checks can now report progress as a fraction over any collection, not just files and JSON fields.
  - A failing git ref-sync check now reports the difference between the two refs, and its remediation hint is now shown in the list of fixes, superseded by a hint provided by the kit itself.

## 0.23.0 — 2026-08-01

### 🎉 Features

- Unify command output under one layout engine and vocabulary (#145)

  Improves the output of `rdy` commands, giving them one shared vocabulary of statuses and headings. A run summary with failures now leads with the worst failure rather than a count of passing checks. The reason for a failing check is given on its own line, and nested checks stay aligned. A fix hint now names the check that raised it. Timings are given only for slow checks. A new `--quiet` flag filters out passing checks, keeping skipped and blocked ones, and counts still cover the whole run.

- Add a plain output style and style selection (#146)

  Status in `rdy` output can now be words instead of emoji, readable on a terminal with no emoji font or through a screen reader. Every command now takes `--style auto|plain|rich`, and `RDY_STYLE` carries a standing preference the flag outranks. If `CI` is set or output is not directed to a terminal (a pipe or a redirect), output defaults to plain style.

- Publish kits inside packages and run them from dependencies (#151)

  Allows installed npm packages to serve as the source of a ReadyUp kit. Consumers can call `rdy run --from npm:<package>` and `rdy list --from npm:<package>` to run and list kits in the package. `rdy run --packages` runs the kits of all packages listed in the ReadyUp config. `rdy list` also reports the kits configured packages publish and names installed dependencies that publish kits not listed in the config. Publishing is a one-line change: a package adds its kit directory to the files it ships.

### ♻️ Refactoring

- Fix computed-property-access lint violations (#155)

  Improves the safety of JSON lookups using computed properties in ReadyUp kit operations.

### ⚙️ Tooling

- Migrate to nmr 0.21.0 and the Vitest projects model (#150)

  `nmr test` no longer runs integration tests, and `nmr test:integration` now runs them on their own. Which suite a test file belongs to is decided by its filename suffix: integration tests carry `.int.test.ts`, and a file with any other suffix, or none, is a unit test. Working in this repo now requires Node 24.16.0 or later.

- Enable the Vitest lint plugin and absorb its autofix fallout (#160)

  Adds Vitest-aware lint rules for test files. Errors surfaced by the new rules but not yet addressed have been downgraded to warnings until they can be fixed.

### 📚 Documentation

- Rewrite the README as a complete reference and trim --help (#147)

  Adds comprehensive documentation to ReadyUp's README, covering every command, flag, and authoring field. The `--help` output has been trimmed to concise help on command options and points the reader to the README for details.

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
