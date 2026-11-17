# Changelog

All notable changes to this project will be documented in this file.

## 0.4.1 — 2026-11-17

### ♻️ Refactoring

- Replaces the `EPIPE` handler copied into each `thor-*` entry point, and the prompt helpers copied into `thor-node` and `thor-npm`, with `ignoreBrokenPipes`, `readAnswer`, and `isAffirmative` from `@williamthorsen/toolbelt.cli`. (#949)

## 0.4.0 — 2026-11-16

### 🎉 Features

- Adds a `--json` flag to `thor-node asdf-shims`, `thor-node pnpm`, and `thor-node prune-modules`, which prints the result as one JSON document on stdout with the same exit codes, and lists the document's fields in each subcommand's `--help`. (#944)
- Makes `thor-node prune-modules` report a usage error for `--json --apply` unless `--no-confirm` is also passed, because a JSON run cannot show the listing and ask for confirmation. (#944)

### 🐛 Bug fixes

- Fixes the issue that `thor-node asdf-shims`, `thor-node pnpm`, and `thor-node prune-modules` reported every error as a usage error, which made a bug exit 2 with a pointer to help rather than reach the crash handler. (#903)
- Fixes the issue that `thor-node prune-modules` crashed with an internal error when it could not read a project, and makes the command keep that project's `node_modules` as `unreadable`, print a warning on stderr, and continue with the remaining projects. (#942)
- Fixes the issue that `--version` reported a failure to resolve the CLI's own version as a usage error and exited 2, rather than exiting 1, the exit code that the help gives for an internal error. (#943)

### ♻️ Refactoring

- Moves each module's unexported functions, unchanged, into a name-sorted `// region | Helpers` block at the end of the module. (#908)
- Moves `ThorNodeEffects` and `PnpmVersionResult` from `thor-node-result.ts` into the new `thor-node-effects.ts`. (#943)
- Reorders the declarations in eight `nodejs-tools` modules under `src/bin`, including `run.ts`, `runPnpm.ts`, and `thor-node-result.ts`, to alphabetize each exported tier and Helpers region according to the declaration-order rule. (#945)

### 🧪 Tests

- Adds `buildThorNodeEffects` under `src/bin/test-utils/`, which returns `ThorNodeEffects` that find nothing and do nothing, and builds the effects in `run.unit.test.ts` and `runPruneModules.unit.test.ts` on it, so that a field added to `ThorNodeEffects` needs one edit rather than one per test file. (#946)
- Replaces `installFakePnpm` and `installFakeAsdf`, which differed only in the program's name, with `installFakeProgram` in `src/test-utils/`, which takes the name as an argument. (#946)

## 0.3.2 — 2026-11-15

### 🐛 Bug fixes

- Fixes the issue that an installed `thor-chrome`, `thor-demo`, `thor-git`, `thor-jira`, `thor-node`, `thor-npm`, `thor-repo`, `thor-secret`, or `overlay` reported an unanticipated error as `<bin>: failed to load: <message>` without stack frames, and now prints `<bin>: internal error: <message>` with the stack frames. (#876)

### ♻️ Refactoring

- Deletes the five identical copies of `createTextBuffer` and imports the one exported by `@williamthorsen/toolbelt.cli/candidate` in their place. (#861)

## 0.3.1 — 2026-11-12

### Notes

- Forced version bump.

## 0.3.0 — 2026-11-09

### 🎉 Features

- Upgrade toolbelt.cli to 0.8.0 (#744)

  Changes every `thor-*` binary to start a usage error with its own name, as `thor-npm: <message>`, in place of `Error: <message>`, and keeps the `Try '… --help'.` line that follows it. The change upgrades `@williamthorsen/toolbelt.cli` to 0.8.0, whose `runCli` prints the new prefix, and changes `thor-chrome`, which reports usage errors through its own renderer, to print the same prefix.

## 0.2.3 — 2026-11-05

### 📦 Dependencies

- Upgrade eslint-config-typescript to 20.2.0 (#692)

  Upgrades `@williamthorsen/eslint-config-typescript` from 20.1.3 to 20.2.0, which brings `eslint-plugin-unicorn` 79 and `typescript-eslint` 8.72.1, and edits the code across the packages to satisfy the rules that the new versions add. The most widespread of those rules is `unicorn/numeric-separators-style`, which now rejects a separator in a number of fewer than 5 digits, such as `1_000`.

## 0.2.2 — 2026-10-26

### 📦 Dependencies

- Upgrades `vitest` and `@vitest/coverage-v8` from 4.1.12 to 5.0.5, and declares Vitest 5's required `vite` peer at 8.3.5 through the catalog in every workspace. (#632)

## 0.2.1 — 2026-10-17

### ♻️ Refactoring

- Rewrites the code reported by the new `unicorn` rules, for example by replacing nested loop branches with `continue` and by removing parameters that no caller varies. (#607)
- Splits `compileCommand`, `listCommand`, and `verifyCommand` in `readyup`, `bin/run.ts` in `nodejs-tools`, and `repo-commands` in `repo-tools` into modules by responsibility, and moves the types and helpers that those modules share into leaf modules such as `thor-node-result.ts` and `verb-run.ts`, so that each file falls under the `max-lines` ceiling. (#609)

### 📦 Dependencies

- Adds `vitest`, `@vitest/coverage-v8`, `typescript`, and `@williamthorsen/nmr` to the workspace catalog at the versions that the root `package.json` pinned, switches the root to `catalog:` for them, and declares `vitest` as a `catalog:` dev dependency in every package, plus `typescript` and `@williamthorsen/nmr` in `readyup`. (#602)

## 0.2.0 — 2026-10-15

### 🎉 Features

- Adds `resolveNodePath(checkoutDir)` to `@williamthorsen/nodejs-tools`, which returns the real path of the node binary that asdf selects for the checkout, or of the running node when asdf cannot be run, exits non-zero, or prints nothing. (#592)

## 0.1.0 — 2026-10-11

### 🎉 Features

- Adds the `thor-node` commands `asdf-shims`, which lists asdf shims stranded by a nodejs version switch, `pnpm`, which checks the running pnpm against the nearest `packageManager` pin, and `prune-modules`, which deletes the `node_modules` directories that the protect-list and the last 30 days of activity do not keep. (#531)
- Moves the default protect-list from `~/.config/tb-node/` to `~/.config/thor-node/protected-node-modules.txt`, which `thor-node prune-modules` reads in place of the `tb-node` file. (#531)

### 🏗️ Internal features

- Adds the `@williamthorsen/nodejs-tools` package with a `thor-node` binary, which prints its help for `--help`, `-h`, or no arguments and exits with code 2 on any other argument, to hold the `tb-node` port in #519. (#526)

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
