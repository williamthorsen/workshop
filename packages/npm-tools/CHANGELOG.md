# Changelog

All notable changes to this project will be documented in this file.

## 0.2.7 — 2026-11-22

### 📦 Dependencies

- Upgrade toolbelt packages (#996)

  Upgrades the `@williamthorsen/toolbelt.*` entries in the `pnpm-workspace.yaml` catalog to their latest versions and imports each symbol that the new releases promoted out of the `/candidate` subpath from its package root. It also corrects the toolbelt imports in the kit-testing example of ReadyUp's `authoring-kits.md` guide.

## 0.2.6 — 2026-11-18

### 🐛 Bug fixes

- Fixes the issue that `thor-npm publish-placeholder` told the user to run `npm login` whenever `npm whoami` failed, including on a network error or an unreachable registry; it now gives that advice only for npm's `ENEEDAUTH` and `E401` codes and otherwise stops with `could not check the npm session: <detail>`. (#977)
- Fixes the issue that `thor-npm publish-placeholder` summarized a failed npm network request by npm's `syscall connect` line rather than by the `FetchError` line that states the reason. (#977)
- Fixes the issue that `thor-npm publish-placeholder` described an npm process ended by a signal as `exit null` rather than naming the signal. (#977)

### ♻️ Refactoring

- Renames the values in the `move-trust` and `publish-placeholder` runners that were named by an adjective or a participle, such as `old`, `revoked`, `unknown`, and `existing`, to names that end with their kind, such as `oldTrust`, `revokeOutcome`, `unknownPermissions`, and `lookupOutcome`. (#979)
- Replaces the private `isRecord` guards in `createNpmClient.ts`, `parseTrustListing.ts`, and `listWorkspacePackages.ts` with the one exported by `@williamthorsen/nmr-core`. (#980)
- Replaces the `ManifestReadError` thrown by `listWorkspacePackages` with an `unreadable-package-manifest` `WorkspaceListing` kind, which names the first manifest that cannot be read or parsed and the reason, and which `runListPackages` reports itself, so that `run.ts` no longer wraps `list-packages` in a catch. (#981)
- Separates the `list-packages` and `publish-placeholder` logic in `thor-npm` from the output streams, replacing `runListPackages` and `runPublishPlaceholder` with renderers that return a `RenderedOutput` and with a plan step and an apply step for `publish-placeholder`, so that only `run.ts` writes to stdout and stderr. (#983)
- Replaces `runMoveTrust` with plan, apply, and restore steps that return results and with renderers called by `run.ts`, so that the `move-trust` logic no longer writes to stderr or chooses an exit code. (#984)

### 🧪 Tests

- Adds the test helper `createNpmStub` and builds the `NpmClient` in each `thor-npm` runner test with it, making a test fail when the command under test calls an npm method that the test did not supply. (#976)
- Renames the test helpers `listed` to `buildListing` in `runMoveTrust.unit.test.ts` and `manifest` to `serializeManifest` in `listWorkspacePackages.unit.test.ts`, which gives each one a name that begins with a verb. (#978)
- Replaces the separate empty-workspace tests of `thor-npm list-packages` with one table that runs the command against a real `pnpm-workspace.yaml` for all six empty-workspace causes, adding runner coverage for the "no-packages-list" and "no-pattern" causes. (#985)

## 0.2.5 — 2026-11-17

### ♻️ Refactoring

- Replaces the `EPIPE` handler copied into each `thor-*` entry point, and the prompt helpers copied into `thor-node` and `thor-npm`, with `ignoreBrokenPipes`, `readAnswer`, and `isAffirmative` from `@williamthorsen/toolbelt.cli`. (#949)

## 0.2.4 — 2026-11-16

### 🐛 Bug fixes

- Fixes the issue that `thor-npm` reported every error from a command as `thor-npm: <message>` with exit 1, which kept a bug from reaching the crash handler; a workspace package manifest that cannot be read is still reported that way. (#903)
- Fixes the issue that `--version` reported a failure to resolve the CLI's own version as a usage error and exited 2, rather than exiting 1, the exit code that the help gives for an internal error. (#943)

## 0.2.3 — 2026-11-15

### 🐛 Bug fixes

- Fixes the issue that an installed `thor-chrome`, `thor-demo`, `thor-git`, `thor-jira`, `thor-node`, `thor-npm`, `thor-repo`, `thor-secret`, or `overlay` reported an unanticipated error as `<bin>: failed to load: <message>` without stack frames, and now prints `<bin>: internal error: <message>` with the stack frames. (#876)

### ♻️ Refactoring

- Deletes the five identical copies of `createTextBuffer` and imports the one exported by `@williamthorsen/toolbelt.cli/candidate` in their place. (#861)

## 0.2.2 — 2026-11-12

### 📦 Dependencies

- Upgrades the version catalog's toolbelt packages and `@williamthorsen/nmr`, along with `prettier`, `@williamthorsen/release-kit`, `codeassembly`, `v11y-check`, and the `@williamthorsen/nmr-core` dependency of `npm-tools`, including the breaking bumps of `@williamthorsen/toolbelt.numbers` to 8.0.0 and `@williamthorsen/toolbelt.errors` to 0.10.0, without changing any source file that imports them. (#833)

## 0.2.1 — 2026-11-12

### Notes

- Forced version bump.

## 0.2.0 — 2026-11-09

### 🎉 Features

- Upgrade toolbelt.cli to 0.8.0 (#744)

  Changes every `thor-*` binary to start a usage error with its own name, as `thor-npm: <message>`, in place of `Error: <message>`, and keeps the `Try '… --help'.` line that follows it. The change upgrades `@williamthorsen/toolbelt.cli` to 0.8.0, whose `runCli` prints the new prefix, and changes `thor-chrome`, which reports usage errors through its own renderer, to print the same prefix.

- Adds the `thor-npm list-packages` command, which prints the name, version, directory, and description of each package in the pnpm workspace that contains the working directory, and whether npm can publish it (that is, whether its manifest does not set `private` to `true`), as a table or, with `--json`, as JSON. (#749)

### 📦 Dependencies

- Raises the minimum Node.js version of `@williamthorsen/npm-tools` from 24 to 24.16.0, which the newly added `@williamthorsen/nmr-core` dependency requires. (#749)

## 0.1.0 — 2026-11-05

### 🎉 Features

- Adds the `@williamthorsen/npm-tools` package, whose `thor-npm` binary initially prints only its help and version and exits 2 on any other argument, because its commands are not implemented yet. (#693)
- Adds the `thor-npm publish-placeholder <package-name>` command, which publishes a `<package-name>@0.0.0` placeholder that contains only `package.json` and `README.md`, so that `npm trust` can then be configured for a name that the registry did not have before. (#695)
- Adds the `thor-npm move-trust` command, which moves a package's trusted publisher (the GitHub repository whose workflow may publish the package) to another repository, keeping its workflow file unless `--file` names another, its environment, and its permissions, and restoring the old trust when adding the new one fails. (#696)

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
