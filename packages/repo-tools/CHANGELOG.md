# Changelog

All notable changes to this project will be documented in this file.

## 0.6.2 — 2026-11-16

### 🐛 Bug fixes

- Fixes the issue that `thor-repo add --write`, `scan --write`, and `move` wrote the registry whenever git failed to report its checkout's branch or its path did not resolve, which let them write a registry in a `live` worktree. (#917)
- Fixes the issue that `thor-repo` read the default registry from `/.config/repos.yaml` and expanded every `~/` path to `/` when `HOME` was unset or empty, and makes `add`, `apply-moves`, `list`, `move`, and `scan` fail with a message that asks for `--file` or names the `~` path that cannot be expanded. (#929)
- Fixes the issue that `thor-repo move` and `thor-repo apply-moves` renamed each moved worktree's Claude Code session directory under `/.claude/projects` when neither `CLAUDE_CONFIG_DIR` nor `HOME` was set, and makes them skip the renames and report the skip on stderr. (#929)
- Fixes the issue that the report of remaining references printed after a move left out the `~` forms of the old paths without saying so when `HOME` was unset or empty, and adds a problem to that report stating that those forms were not searched. (#929)

### ♻️ Refactoring

- Moves each module's unexported functions, unchanged, into a name-sorted `// region | Helpers` block at the end of the module. (#908)
- Declares `MoveOptions` in `move-report.ts` rather than in `runMove.ts`, and extracts the search for another registry entry whose normalized path is the move target into `findPathClaimant` in `registry.ts`, which `runMove` and `runApplyMoves` both call. (#918)
- Moves `runList`, `ListOptions`, and `CLONE_STATES` from `repo-commands.ts` into a new `runList.ts`, which leaves `repo-commands.ts` with the adapter wiring and the command tree. (#925)
- Renames the collections in `repo-tools`' move, scan, list, and reference-finding code and their tests so that each name ends with what the collection holds, such as the `MovePlan` field `relocated`, which becomes `relocatedWorktrees`, and the `MoveOutcome` field `completed`, which becomes `completedMoves`. (#927)
- Orders the exports and helpers in `repo-tools` source modules alphabetically, as the declaration-order rule of the layout conventions requires. (#931)

### 🧪 Tests

- Splits the `list`, `scan`, and `add` tests out of `repo-commands.unit.test.ts` into `list-command.unit.test.ts`, `scan-command.unit.test.ts`, and `add-command.unit.test.ts`, which share the fixtures in `test-utils/registry-fixtures.ts` and the `buildRegistryRunner` factory in `test-utils/registry-runner.ts` with `move-commands.unit.test.ts` in place of the two near-identical run helpers that each file kept before. (#925)
- Adds `initWithIndex` and `commitStaged` to `src/test-utils/git-fixture.ts` and replaces the hand-written `git init`, `git add`, `git commit`, and `execFileSync('git', ...)` calls in `repo-commands.tool.test.ts`, `git-clone.tool.test.ts`, and `registry.tool.test.ts` with the fixture's helpers. (#928)

## 0.6.1 — 2026-11-15

### 🐛 Bug fixes

- Fixes the issue that an installed `thor-chrome`, `thor-demo`, `thor-git`, `thor-jira`, `thor-node`, `thor-npm`, `thor-repo`, `thor-secret`, or `overlay` reported an unanticipated error as `<bin>: failed to load: <message>` without stack frames, and now prints `<bin>: internal error: <message>` with the stack frames. (#876)
- Fixes the issue that `overlay` and `thor-repo` printed their build-first message whenever any module imported by the built entry failed to resolve, and now print it only when the build output itself is missing. (#876)

## 0.6.0 — 2026-11-12

### 🎉 Features

- Makes `thor-repo move` and `thor-repo apply-moves` run `direnv allow` in each moved worktree that has an `.envrc` at its root, when direnv is installed, so that a moved `.envrc` doesn't need a manual `direnv allow` at its new path. (#828)
- Makes `thor-repo move` and `thor-repo apply-moves` rename each moved worktree's Claude Code session directory, under `$CLAUDE_CONFIG_DIR/projects` or else `~/.claude/projects`, to the name that Claude Code derives from the worktree's new path, and reports on stderr a directory whose new name is already taken, leaving it to be merged by hand. (#828)
- Makes `thor-repo move` and `thor-repo apply-moves` remove each former parent directory that the move leaves empty apart from a `.DS_Store`. (#828)

## 0.5.0 — 2026-11-12

### 🎉 Features

- Adds an optional, hand-asserted `prefix` field to registry entries, which `thor-repo list --json` emits and `thor-repo scan --write` keeps, and makes every `thor-repo` verb refuse a registry whose prefix is empty or contains whitespace or a period, or whose entries declare two prefixes that are equal regardless of case. (#824)

## 0.4.0 — 2026-11-12

### 🎉 Features

- Adds the `thor-repo move <name> <path>` command, which moves a registered clone and the worktrees beside it, repairs each worktree's link, sets the entry's `path`, appends the old path to the entry's new `formerPaths` field, and reports the remaining references to the old path in the registered clones and under each `--search` directory. (#820)
- Adds the `thor-repo apply-moves` command, which moves each clone found at one of its entry's `formerPaths` to the entry's `path` on a machine that does not have that path yet, and skips and reports an entry for which the move is ambiguous. (#820)

## 0.3.0 — 2026-11-09

### 🎉 Features

- Upgrade toolbelt.cli to 0.8.0 (#744)

  Changes every `thor-*` binary to start a usage error with its own name, as `thor-npm: <message>`, in place of `Error: <message>`, and keeps the `Try '… --help'.` line that follows it. The change upgrades `@williamthorsen/toolbelt.cli` to 0.8.0, whose `runCli` prints the new prefix, and changes `thor-chrome`, which reports usage errors through its own renderer, to print the same prefix.

## 0.2.3 — 2026-11-05

### 🐛 Bug fixes

- Fixes the issue that `thor-repo add` recorded the owner and name of an origin hosted outside `github.com` as `repo` and queried GitHub for it, so that such a clone now registers without `repo`, `visibility`, or `runner`. (#661)
- Fixes the issue that `thor-repo add` and `thor-repo scan` failed on a clone whose `git ls-files` output exceeds 1 MiB: `add` refused the clone with `cannot list the tracked files`, and `scan` listed it under `no clone on this machine`. (#686)
- Fixes the issue that `thor-repo add` and `thor-repo scan` hid the cause when git could not list a clone's tracked files: `add` now includes git's reason in its error, and `scan` reports the reason on stderr and keeps the entry's stack rather than listing the clone as absent. (#686)

### 📦 Dependencies

- Upgrade eslint-config-typescript to 20.2.0 (#692)

  Upgrades `@williamthorsen/eslint-config-typescript` from 20.1.3 to 20.2.0, which brings `eslint-plugin-unicorn` 79 and `typescript-eslint` 8.72.1, and edits the code across the packages to satisfy the rules that the new versions add. The most widespread of those rules is `unicorn/numeric-separators-style`, which now rejects a separator in a number of fewer than 5 digits, such as `1_000`.

## 0.2.2 — 2026-10-26

### 📦 Dependencies

- Upgrades `vitest` and `@vitest/coverage-v8` from 4.1.12 to 5.0.5, and declares Vitest 5's required `vite` peer at 8.3.5 through the catalog in every workspace. (#632)

## 0.2.1 — 2026-10-17

### 🐛 Bug fixes

- Fixes the issue that `thor-repo scan --write` and `thor-repo add` wrote a `stack` list longer than 80 columns with one item per line and folded a long value onto a second line, even in an entry that the write did not change. (#611)

### ♻️ Refactoring

- Rewrites the code reported by the new `unicorn` rules, for example by replacing nested loop branches with `continue` and by removing parameters that no caller varies. (#607)
- Splits `compileCommand`, `listCommand`, and `verifyCommand` in `readyup`, `bin/run.ts` in `nodejs-tools`, and `repo-commands` in `repo-tools` into modules by responsibility, and moves the types and helpers that those modules share into leaf modules such as `thor-node-result.ts` and `verb-run.ts`, so that each file falls under the `max-lines` ceiling. (#609)

### 📦 Dependencies

- Adds `vitest`, `@vitest/coverage-v8`, `typescript`, and `@williamthorsen/nmr` to the workspace catalog at the versions that the root `package.json` pinned, switches the root to `catalog:` for them, and declares `vitest` as a `catalog:` dev dependency in every package, plus `typescript` and `@williamthorsen/nmr` in `readyup`. (#602)

## 0.2.0 — 2026-10-17

### 🎉 Features

- Adds the registry fields `visibility` and `runner` to `thor-repo`. `thor-repo scan` and `thor-repo add` derive them from GitHub through `gh`, and `runner` is the label selected by the repo's `CI_RUNS_ON` Actions variable. (#596)
- Adds a warning from `thor-repo scan` about a public repo whose `runner` is set, because a self-hosted runner must not run a fork's pull request. (#596)
- Adds the `--visibility <public|private>` and `--runner <label>` filters to `thor-repo list`. (#596)
- Adds `--clone <present|absent|all>` to `thor-repo list` and makes `present` the default, so that `list` omits the entries whose clone is absent from this machine. (#596)
- Adds the stack names `docker`, `go`, `neon`, `playwright`, `postgres`, and `shellspec`, which `thor-repo scan` detects from a repo's tracked files and `thor-repo list --stack` accepts. (#596)

## 0.1.0 — 2026-10-11

### 🎉 Features

- Adds the `thor-repo` commands `list`, `scan`, and `add`, which print the repos selected from `~/.config/repos.yaml` by tag or stack, report each entry whose stack differs from what its clone's tracked files signal, and print the entry that registers a clone, writing to the registry only under `--write`. (#528)

### 🏗️ Internal features

- Renames the unreleased `repos` package to `@williamthorsen/repo-tools` and its binary from `repos` to `thor-repo`, without changing what the scaffolded binary does. (#523)

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
