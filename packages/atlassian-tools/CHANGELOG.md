# Changelog

All notable changes to this project will be documented in this file.

## 0.2.5 — 2026-11-22

### 📦 Dependencies

- Upgrade toolbelt packages (#996)

  Upgrades the `@williamthorsen/toolbelt.*` entries in the `pnpm-workspace.yaml` catalog to their latest versions and imports each symbol that the new releases promoted out of the `/candidate` subpath from its package root. It also corrects the toolbelt imports in the kit-testing example of ReadyUp's `authoring-kits.md` guide.

## 0.2.4 — 2026-11-17

### 🐛 Bug fixes

- Fixes the issue that `thor-jira configure-project --seed-backlog` sent and printed malformed JQL when the status name contained a double quote or a backslash. (#960)
- Fixes the issue that `thor-jira` wrote its failure messages for exit codes 3 (keychain unavailable), 4 (request rejected by Jira), and 6 (Jira unreachable) without the `thor-jira:` prefix that its usage errors contain. (#962)

### ♻️ Refactoring

- Replaces the `EPIPE` handler copied into each `thor-*` entry point, and the prompt helpers copied into `thor-node` and `thor-npm`, with `ignoreBrokenPipes`, `readAnswer`, and `isAffirmative` from `@williamthorsen/toolbelt.cli`. (#949)
- Splits the reconciliation in `configure-project` into `reconcileProject`, which reports each completed step as a typed value and does not write any output, and `renderConfigureStep`, which composes the lines that the command prints for each step. (#961)
- Replaces the local `readStreamText` modules in `atlassian-tools` and `secret-tools` and their unit tests with the `readStreamText` export of `@williamthorsen/toolbelt.cli/candidate`. (#963)
- Splits `src/bin/subcommand-support.ts` into one module per concern (`RunEffects.ts`, `reportFailures.ts`, `createDeferredStore.ts`, and `stripOneTrailingNewline.ts`), moves `succeed` into `authCommand.ts`, and stops exporting the exit codes that only `reportFailures.ts` uses. (#964)

### 🧪 Tests

- Moves the `createFakeRequest.ts` and `projectConfiguration.ts` test helpers from `src/test-utils/` into `src/bin/test-utils/`, the nearest common ancestor of every test and helper that imports them. (#965)
- Builds the `POST /rest/api/3/workflows` response in `buildProjectRoutes` from `buildStatus` and `buildWorkflow` in `projectConfiguration.ts`, and removes the private `buildProjectWorkflow` and the inline status objects that duplicated those builders. (#965)
- Adds a `renderTestPlan` helper to `renderPlan.unit.test.ts` and routes every test's `renderPlan` call through it, so that each test body states only the plan entries and render options that it varies. (#966)

## 0.2.3 — 2026-11-16

### 🐛 Bug fixes

- Fixes the issue that `thor-jira` reported an error that it did not recognize, such as a defect in the tool, as a usage error that exits 2 with a pointer to help, instead of passing it to the crash handler. (#907)
- Fixes the issue that `--version` reported a failure to resolve the CLI's own version as a usage error and exited 2, rather than exiting 1, the exit code that the help gives for an internal error. (#943)

### ♻️ Refactoring

- Moves each module's unexported functions, unchanged, into a name-sorted `// region | Helpers` block at the end of the module. (#908)

## 0.2.2 — 2026-11-15

### 🐛 Bug fixes

- Fixes the issue that an installed `thor-chrome`, `thor-demo`, `thor-git`, `thor-jira`, `thor-node`, `thor-npm`, `thor-repo`, `thor-secret`, or `overlay` reported an unanticipated error as `<bin>: failed to load: <message>` without stack frames, and now prints `<bin>: internal error: <message>` with the stack frames. (#876)

## 0.2.1 — 2026-11-12

### Notes

- Forced version bump.

## 0.2.0 — 2026-11-09

### 🎉 Features

- Upgrade toolbelt.cli to 0.8.0 (#744)

  Changes every `thor-*` binary to start a usage error with its own name, as `thor-npm: <message>`, in place of `Error: <message>`, and keeps the `Try '… --help'.` line that follows it. The change upgrades `@williamthorsen/toolbelt.cli` to 0.8.0, whose `runCli` prints the new prefix, and changes `thor-chrome`, which reports usage errors through its own renderer, to print the same prefix.

### 🧪 Tests

- Replaces the real-time sleeps in tests with waits that do not depend on wall time, a `setImmediate` yield in the `runRdy` and `readStreamText` tests and a wait for the stub upstream's close in the `speech-proxy` disconnect test, and disables `sky-pilot/no-real-time-sleep` at the two `chrome-tools` polling loops that wait on a real external process. (#742)

## 0.1.3 — 2026-11-05

### 📦 Dependencies

- Upgrade eslint-config-typescript to 20.2.0 (#692)

  Upgrades `@williamthorsen/eslint-config-typescript` from 20.1.3 to 20.2.0, which brings `eslint-plugin-unicorn` 79 and `typescript-eslint` 8.72.1, and edits the code across the packages to satisfy the rules that the new versions add. The most widespread of those rules is `unicorn/numeric-separators-style`, which now rejects a separator in a number of fewer than 5 digits, such as `1_000`.

## 0.1.2 — 2026-10-26

### 📦 Dependencies

- Upgrades `vitest` and `@vitest/coverage-v8` from 4.1.12 to 5.0.5, and declares Vitest 5's required `vite` peer at 8.3.5 through the catalog in every workspace. (#632)

## 0.1.1 — 2026-10-17

### 📦 Dependencies

- Adds `vitest`, `@vitest/coverage-v8`, `typescript`, and `@williamthorsen/nmr` to the workspace catalog at the versions that the root `package.json` pinned, switches the root to `catalog:` for them, and declares `vitest` as a `catalog:` dev dependency in every package, plus `typescript` and `@williamthorsen/nmr` in `readyup`. (#602)

## 0.1.0 — 2026-10-11

### 🎉 Features

- Adds the `tb-jira` commands to `thor-jira`: `auth` stores, removes, and reports the Jira API token in the macOS keychain, `issue list` lists a project's work items, and `configure-project` reconciles a Jira Cloud project's statuses, workflow transitions, and board features against `jira-project-spec.json`, with a `--dry-run` preview. (#532)

### 🏗️ Internal features

- Adds the `@williamthorsen/atlassian-tools` package with a `thor-jira` binary, which prints its help for `--help`, `-h`, or no arguments and exits with code 2 on any other argument, to hold the `tb-jira` port in #520. (#527)

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
