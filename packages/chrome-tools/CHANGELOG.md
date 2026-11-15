# Changelog

All notable changes to this project will be documented in this file.

## 0.3.2 — 2026-11-15

### 🐛 Bug fixes

- Fixes the issue that an installed `thor-chrome`, `thor-demo`, `thor-git`, `thor-jira`, `thor-node`, `thor-npm`, `thor-repo`, `thor-secret`, or `overlay` reported an unanticipated error as `<bin>: failed to load: <message>` without stack frames, and now prints `<bin>: internal error: <message>` with the stack frames. (#876)
- Fixes the issue that `thor-chrome` reported a missing `git` as a prose line even under `--json`, rather than as the `missing-command` error object that it reports for a missing `curl`, `lsof`, or `pgrep`. (#893)
- Fixes the issue that `thor-chrome quit`, `quit --idle`, and `delete --force` failed with `quit-failed` when the browser had already exited before the signal reached it, and makes each command report that profile as stopped. (#894)
- Fixes the issue that the `quit-failed` message for a refused signal read only `could not signal PID`, by stating that `thor-chrome` was not permitted to signal the process and that it can be ended from a terminal outside the sandbox or by the user who owns it. (#894)

### ♻️ Refactoring

- Separates `thor-chrome`'s logic from its presentation: Each verb returns a typed result or its per-profile outcomes, which the entry point renders as prose or JSON, and `Invocation` no longer exposes the format, the output streams, or the outcome state. (#892)
- Adds a `Seconds` or `Milliseconds` suffix to each epoch-time variable in `chrome-tools` and its test utilities, such as `nowSeconds` in `quitIdleProfiles`, `birthTimeSeconds` in `instance-page.ts`, and `clockMilliseconds` in the fake `thor-chrome`. (#897)

### 🧪 Tests

- Adds `makeLaunchFake` to `launch-fixtures.ts`, which builds a fake with `/bin/sh` as the browser app and the profile `thrive`, and uses it in `makeRunningFake` and in the launch, launch-refusal, and `thor-chrome` unit tests in place of their hand-built setup. (#891)
- Merges the two examples in `launch.refusals.unit.test.ts` for a launched browser that declined the port for policy reasons, which shared their setup and run, into one example that keeps the assertions of both. (#891)
- Deletes the two usage-error examples and the `list --json` fields example from `thor-chrome.tool.test.ts`, because unit tests already make each of their assertions once the `--json` usage-error unit test also asserts empty stderr. (#895)
- Replaces the package's own `makeFixtureDir` with `createTempTree` from `@williamthorsen/toolbelt.testing/candidate` in every `chrome-tools` test and test helper, and deletes `test-utils/fixture-dir.ts` together with `writeFixtureFile`, which the package did not call anywhere. (#896)

## 0.3.1 — 2026-11-12

### Notes

- Forced version bump.

## 0.3.0 — 2026-11-09

### 🎉 Features

- Changes `thor-chrome` to print a usage error as `thor-chrome: <message>` in place of `Error: <message>`, matching the other `thor-*` binaries. (#744)

### 🧪 Tests

- Replaces the real-time sleeps in tests with waits that do not depend on wall time, a `setImmediate` yield in the `runRdy` and `readStreamText` tests and a wait for the stub upstream's close in the `speech-proxy` disconnect test, and disables `sky-pilot/no-real-time-sleep` at the two `chrome-tools` polling loops that wait on a real external process. (#742)

## 0.2.0 — 2026-11-08

### 🎉 Features

- Changes the port that `thor-chrome` derives for a branch: a branch that encodes a ticket gets 20000 plus the ticket number, wrapped within 20000-29999, so that branch `321` debugs on 20321 rather than 9321, and any other branch gets a hash of `<repo>/<branch>` within 30000-39999, so that `main` gets a different port in each repository. (#703)
- Adds `--repo` and `--branch` to `thor-chrome launch` and `thor-chrome status`, which derive the profile and port from the values given in place of the ones that git reports, for a working directory that git cannot read, such as one that the sandbox denies, and names them in the repair hint of the underived-profile refusal. (#703)
- Adds a `derivedPort` field to every profile object in the `--json` output and shows the derived port on each derived profile's line in `thor-chrome list`, beside the running port when the two differ, so that a port collision is visible before a launch. (#703)
- Names the thor-chrome profile that holds a busy port in the port-busy refusal of `thor-chrome launch`, and suggests `thor-chrome quit <profile>` to free the port. (#703)
- Changes `thor-chrome launch` to open its URLs as background tabs through the DevTools endpoint without bringing the browser to the front, and against a running profile to open them in that instance without starting a new browser; a page that fails to open is refused with `page-open-failed`. (#704)
- Adds the `--headless` launch option, which starts the browser without a window or Dock icon on the same DevTools endpoint, reports each running browser's mode in the `headless` profile field and in `list` and `status`, and refuses with `mode-mismatch` a launch whose mode differs from the running instance's. (#704)

## 0.1.1 — 2026-11-05

### 📦 Dependencies

- Upgrade eslint-config-typescript to 20.2.0 (#692)

  Upgrades `@williamthorsen/eslint-config-typescript` from 20.1.3 to 20.2.0, which brings `eslint-plugin-unicorn` 79 and `typescript-eslint` 8.72.1, and edits the code across the packages to satisfy the rules that the new versions add. The most widespread of those rules is `unicorn/numeric-separators-style`, which now rejects a separator in a number of fewer than 5 digits, such as `1_000`.

## 0.1.0 — 2026-10-26

### 🎉 Features

- Adds the initial `@williamthorsen/chrome-tools` package, whose `thor-chrome` binary prints its help and rejects every other argument with exit code 2 until its commands for managing Chrome debug sessions are implemented. (#635)
- Implements the `thor-chrome` commands `launch`, `list`, `status`, `quit`, `delete`, and `show-instance-page`, which run Chrome debug sessions on macOS, giving each worktree its own profile and port, and replace the placeholder that printed only its help. (#637)

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
