# Running checks

## Commands

`rdy help <command>` prints what `rdy <command> --help` prints, and `rdy help <topic>` prints the doc file covering that topic. Run `rdy help` for the available topics.

## Selecting what runs

A positional argument names a kit, optionally with checklists or suites after a colon:

```bash
rdy deploy            # every checklist in the deploy kit
rdy deploy:build,test # two checklists from it
rdy deploy:fast       # a suite
rdy deploy release    # two kits
```

`--checklists` filters within a single kit, and pairs with one positional kit, with `--file` or `--url`, or with no kit at all. Naming two kits, or one that already has a `:checklist` filter, is an error rather than a merge.

Kit names may contain `/`, as in `shared/deploy`. To name one that starts with `-`, place it last, after `--`:

```bash
rdy run -- "--odd-kit-name"
```

## Run options

`--quiet` filters by status whereas `--report-on` filters by severity, so the two compose rather than override. Both keep the parent checks of anything they show, so a failure nested under passing parents still appears beneath them.

A checklist emptied by either filter renders no block at all: Its summary-table row states the same counts in a column that the reader can compare across the run. A block is withheld only when a table will include its row, so a run of one checklist reports its block even when the filters leave nothing in it, and a run that withholds one always ends with the table.

`--diagnose` runs the `check` of every check turned off by its own `skip`, and reports the ones that would have passed: A `skip` exists to prevent a wrong failure, and one that suppresses a right pass instead renders as an ordinary white circle that nothing fails. [When a check skips](authoring-kits.md#when-a-check-skips) covers the judgment that this flag cannot make. It is opt-in because it executes exactly the work that a skip was written to avoid, which may reach a network or a registry. What it finds is reported as [advisory warnings](#advisory-warnings), and the statuses, counts, durations, and exit code are those of an undiagnosed run.

A check's own [`quiet`](authoring-kits.md#checks) is this flag narrowed to that one check, and a kit whose every check declares it renders what `--quiet` renders. It is not `skip`, which reports that the check did not run and why: A quiet check runs, and its pass is included in the count line and the exit code like any other -- only the line is withheld. `--json` is unaffected, so `rdy run --json --detail full` shows a quiet check that passed.

## Kit sources

| Source     | Format                    | Example                       |
| ---------- | ------------------------- | ----------------------------- |
| GitHub     | `github:org/repo[@ref]`   | `--from github:acme/ops@v2`   |
| Bitbucket  | `bitbucket:ws/repo[@ref]` | `--from bitbucket:team/ops`   |
| npm        | `npm:<package>`           | `--from npm:@acme/eslint-cfg` |
| Local repo | `<path>`                  | `--from ../other-repo`        |
| Directory  | `dir:<path>`              | `--from dir:/shared/kits`     |
| Global     | `global`                  | `--from global`               |

`@ref` defaults to `main`. For a local repo path, readyup looks for kits in `<path>/.readyup/kits/`; a `dir:` path is used directly.

`npm:` resolves an installed dependency, so the kit that runs is the one published with the version that the project has. See [package-hosted kits](publishing-kits.md#package-hosted-kits).

Private repositories use ambient tokens: `GITHUB_TOKEN` (falling back to `gh auth token`) and `BITBUCKET_TOKEN`. Without a token, requests are sent anonymously and succeed only for public repositories.

## Reading the output

A check line reads `token name <separator> detail [progress] (duration)`. The separator is `·` in `rich` and `-` in `plain`; progress is shown in brackets. Durations appear from 100 ms up, never on a check that did not run, and always on a tail or total line.

**A failed line states only its claim.** The reason renders beneath it, indented to the name column -- the authored `detail` first, then any thrown exception after its `Error:` label. Passes and skips keep their detail inline.

**Every block closes with its count line.** A count line is labelled `Total:`, leads with the run's worst severity, and reports counts in a fixed order -- errors, warnings, recommendations, passed, blocked, skipped -- omitting any that is zero, separated by commas. The label distinguishes the line from the check lines above it, which lead with a token in the same column. It is the block's last line, following any `Fixes` recap.

**Every block opens with a breadcrumb.** A run block is headed `━━`, and its segments read source, then kit, then checklist, separated by a spaced slash. A segment appears only when it distinguishes something: the source when the kit came from anywhere but the local kits directory or the working directory, the kit when the run includes more than one or a source segment is already there, the checklist when the kit runs more than one. A lone local kit running one checklist has no heading at all. The summary table is headed `━━` too, as a peer of the blocks that it tallies, and each of its rows repeats the breadcrumb of the block that it summarizes, the same segments elided; `Fixes` and each command's own heading stay at `──`, which heads a section and nothing else.

Blank lines separate blocks rather than decorate headings: None opens a command's output, follows a heading, or falls inside a block, and exactly one separates one block from the next, a kit boundary included. More than one checklist anywhere in the run adds a summary table:

```
━━ 📋 build
🟢 Types check cleanly (343ms)
🟢 Bundle is within budget · 42kB of a 50kB budget [84%]
🟢 Total: 2 passed (343ms)

━━ 📋 integration
🟢 Database is reachable
🔴 Migrations are applied (151ms)
   2 migrations pending: add_users, add_index
⚪ Seed data is loaded · seeding is disabled outside CI
── Fixes
🔴 Migrations are applied
   💊 Run `pnpm migrate` against the target database
🔴 Total: 1 error, 1 passed, 1 skipped (151ms)

━━ Summary
───────────────────────────────────────────────────
🟢 build        343ms  2 passed
🔴 integration  151ms  1 error, 1 passed, 1 skipped
───────────────────────────────────────────────────
🔴 Total: 1 error, 3 passed, 1 skipped (494ms)
```

The heading of a kit from an installed package, a repository, or a URL names its source, so a long run shows which checks belong to which kit without the reader scrolling for it:

```
━━ 📦 @acme/release-kit@2.1.0 / 📓 npm-auto-publish / 📋 repo
━━ 🌐 github:acme/checks@main / 📓 default
━━ 📁 ../shared-kits / 📓 default
```

A run spanning several kits tallies them together, each row naming its source and kit so it reads without reference to the blocks above. Row names have no role glyphs, since the padding that aligns the columns counts characters rather than terminal cells:

```
━━ Summary
─────────────────────────────────────────────────────────────────────────────────
🟢 @acme/release-kit@2.1.0 / npm-auto-publish / repo      12ms  4 passed
🟢 @acme/release-kit@2.1.0 / npm-auto-publish / secrets    9ms  2 passed
🔴 github:acme/checks@main / default                     151ms  1 error, 1 passed
🟢 ../shared-kits / default                                4ms  3 passed
─────────────────────────────────────────────────────────────────────────────────
🔴 Total: 1 error, 10 passed (176ms)
```

## Output styles

`--style` selects rendering; `RDY_STYLE` sets a standing preference. The flag outranks the environment variable, which outranks detection.

| Value   | Renders                                                                       |
| ------- | ----------------------------------------------------------------------------- |
| `auto`  | `plain` under CI or when output is not a terminal, `rich` otherwise (default) |
| `plain` | Fixed-width ASCII words                                                       |
| `rich`  | Emoji tokens                                                                  |

`CI` detects a runner that attaches a pseudo-terminal; the terminal check detects an interactive `rdy | grep FAIL`. An explicit `CI=false` is read as a denial. Naming a style that does not exist fails the invocation.

In `plain`, every character is printable ASCII, heading rules and separators included. A role glyph is omitted but its column is kept, so names stay aligned; in a breadcrumb, which has no column to keep, the spaced separator alone separates one segment from the next:

```
== integration
PASS  Database is reachable
FAIL  Migrations are applied (151ms)
      2 migrations pending: add_users, add_index
SKIP  Seed data is loaded - seeding is disabled outside CI
FAIL  Total: 1 error, 1 passed, 1 skipped (151ms)
```

```
== @acme/release-kit@2.1.0 / npm-auto-publish / repo
```

Once a style is named explicitly, output is the same for a terminal and a pipe. `--style` is independent of `--json`: The JSON document never changes.

## Suppressing a finding

A check naming located sites reports each as `path:line`. A pragma in the source suppresses one:

```ts
// rdy-ignore-next-line -- the bootstrap shim, no deps allowed
error instanceof Error ? error.message : String(error);
```

| Token                  | Covers                 |
| ---------------------- | ---------------------- |
| `rdy-ignore`           | The line containing it |
| `rdy-ignore-next-line` | The line below it      |

With no argument a pragma covers every check for the line, which is the form to use: A kit publishes advice rather than a lint rule, so silencing one reviewed site should require a comment and nothing more. A trailing `-- <reason>` is optional everywhere and changes nothing about what is suppressed.

One or more comma-separated check ids may follow the token, and the pragma then suppresses for those checks alone:

```ts
// rdy-ignore-next-line toolbelt.errors/no-instanceof-error -- the bootstrap shim, no deps allowed
error instanceof Error ? error.message : String(error);
```

A failed check prints its id bracketed ahead of its fraction, and a pragma uses that printed form:

```
❌ No source narrows a thrown value by hand [toolbelt.errors/no-instanceof-error] [2 of 5]
   src/a.ts:4, src/b.ts:9
```

A kit published by an installed package namespaces its checks under that package's name with the scope stripped, so `@williamthorsen/toolbelt.errors` yields `toolbelt.errors/<id>`. The fully-qualified `@williamthorsen/toolbelt.errors/<id>` is accepted too; the bare id is not, because the namespace keeps two kits' same-named checks apart. A kit loaded any other way -- from the local kits directory, a `--from` directory, or a URL -- has no namespace, and its bare id is accepted. An id naming no check in the run suppresses nothing, as does a pragma on a check that declares no id at all.

The id list ends at the first token that is not an id: a `--` reason, the delimiter closing a block comment, a second pragma token, or the line's end. Everything before that is read as ids, so a reason written without `--` names checks rather than explaining the decision: `// rdy-ignore because the API is frozen` suppresses for a check called `because`, and therefore for none. Write a reason after `--`. Under `--json`, each check entry includes its `id` in both detail projections.

A suppressed finding is removed from the audit rather than downgraded: out of the detail, and out of both halves of the check's fraction, so a project that has settled every remaining site reaches completion rather than staying one short. An unqualified pragma takes the site out of every check's fraction at once, which keeps the checks of one run comparable; a qualified one takes it out of the checks that it names and leaves it counted in the rest.

The token is read from the source's raw text and matched wherever it appears on the line, so a detector that blanks comments before it scans cannot erase a pragma first, and a line that quotes the token in a string suppresses a finding sited on it.

A pragma that outlives the finding for which it was written is reported under [`pragma-unused`](#advisory-warnings), so a site rewritten or a check retired leaves a comment named by the next run rather than dead text that nobody notices.

## Advisory warnings

`rdy run` raises advisories about the run that it is performing. Warnings go to stderr in both modes and appear under `warnings` in JSON; none affects the exit code.

Three compare the kits that it is about to run against `.readyup/manifest.json` and say so when they disagree.

| Code           | Raised when                                                              |
| -------------- | ------------------------------------------------------------------------ |
| `input-stale`  | A file inlined by the compile changed since the bundle was built from it |
| `source-stale` | The kit's TypeScript changed since the compiled bundle was built from it |
| `target-drift` | The compiled bundle no longer matches the manifest's recorded hash       |

They are silent when the manifest is absent, when no entry describes the kit, when an entry records no hashes or no input closure, or when a file that they would compare is gone or cannot be read. Only the local manifest is consulted, so a kit loaded through `--from` is out of scope -- run `rdy verify` in that root instead. They also do not apply to `--url` or `--jit`.

A manifest that is present and cannot be read is the one case with its own advisory, because all three then go unchecked for every kit in the run.

| Code                  | Raised when                                                           |
| --------------------- | --------------------------------------------------------------------- |
| `manifest-unreadable` | `.readyup/manifest.json` exists but does not parse against the schema |

An absent manifest is not reported: It is the normal state of a project that never compiled, and indicates nothing about any kit.

Two more come from [`--diagnose`](#run-options), and are raised only when that flag is passed.

| Code                     | Raised when                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| `diagnosis-inconclusive` | A diagnosed check threw, or returned a value expressing no verdict |
| `skip-masks-pass`        | A check turned off by its own `skip` would have passed had it run  |

These read the checks rather than the manifest, so none of the silencing conditions above affects them: They apply wherever the kit came from, `--url`, `--from`, `--packages`, and `--jit` alike. A check blocked by a failed precondition declared nothing and is not diagnosed.

One compares the readyup that compiled a bundle against the one running it.

| Code           | Raised when                                                      |
| -------------- | ---------------------------------------------------------------- |
| `version-skew` | A bundle was compiled by a newer readyup than the one running it |

Only that direction is reported: The recorded version is fixed at publish time while runners are upgraded, so a bundle older than the runner is the ordinary state of a published kit. The advisory stands in for a floor that the author never declared, so it is never raised for a kit declaring [`minReadyupVersion`](authoring-kits.md#kit) -- a runner below that floor has already failed to load the kit. A bundle recording no version is not reported, `--jit` runs from TypeScript source included.

One more reads the sources that the run's checks examined and reports the pragmas among them that suppressed nothing.

| Code            | Raised when                                                                        |
| --------------- | ---------------------------------------------------------------------------------- |
| `pragma-unused` | An [`rdy-ignore` pragma](#suppressing-a-finding) suppressed no finding in this run |

The evidence is what the checks read. A pragma is reported only when some check examined the file containing it -- swept it through [`readTrackedSources`](check-utils.md#project-sources), or named it in [`scanned`](authoring-kits.md#checks) -- and no check of the run suppressed a finding on the line covered by the pragma; a pragma in a file examined by no check is not reported, because the run established nothing about it. Paths are matched by their resolved form, so a check declaring absolute paths and one reporting relative finding paths agree, and the warning prints the path relative to `cwd`, the form in which findings are printed. One ledger spans the invocation, so a file that two kits both examined is scanned once. A diagnosis contributes neither examined paths nor suppressions, the run having turned that check off; a sweep that the check read in its own `skip` before returning the reason was recorded when it ran, and still counts.

Recognition for the report is stricter than for suppression. A token is a site when it is in a comment with nothing but whitespace and `*` between it and the `//` or `/*` that opened one, in a JavaScript-family file. A token in a string, in a regular expression, following prose or code inside a comment, or second on its line is not a site. Suppression is unchanged and still matches the raw text of every file type, so the report can only ever withhold a warning, never cause a suppressed finding to be reported.

Two limits follow from that. Recognition reads JavaScript-family syntax, so a pragma in a source of any other kind is never reported. And a pragma written for a check that skipped, was blocked, or was not loaded is reported when any check examined its file, that skipped check's own `skip` included when it swept before skipping: The run has no evidence that the check would have suppressed anything.

## Kit import compatibility

A compiled kit leaves its `readyup` imports unbundled, so it binds whichever readyup runs it rather than the one that built it. Before running a bundle, `rdy run` reads the `readyup` symbols that it imports and compares them against what the running readyup exports.

A kit does not run if it imports a symbol, or a `readyup` subpath, that the runner does not export: The failure is a `kit-load` error naming every missing symbol, the kit, and the publishing package if the kit has one, and it exits `2`. Unlike the staleness advisories above, this check is not manifest-derived and applies wherever the kit came from, `--url`, `--from`, and `--packages` included. `--jit` runs load TypeScript source rather than a bundle, and are unaffected.

The remedy depends on where the kit is maintained:

| Kit source                     | Remedy                                                  |
| ------------------------------ | ------------------------------------------------------- |
| This project's `.readyup/kits` | Run `rdy compile` to rebuild it                         |
| An installed package           | Upgrade the package to a release built for this readyup |
| A URL or remote repository     | Ask the kit's publisher to recompile it                 |

An import binding no name that the runner could be asked for -- a namespace import, a default import, a dynamic import -- has its names left unchecked. Its subpath is still checked, so a namespace import of a subpath that readyup does not publish fails like any other.

## Exit codes

| Code | Meaning                                                                                       |
| ---- | --------------------------------------------------------------------------------------------- |
| `0`  | Ran and found no problems                                                                     |
| `1`  | Ran and found problems: failed checks, a kit that fails `verify`, a kit that fails to compile |
| `2`  | Could not complete the invocation: a usage, config, kit-load, or internal error               |

The distinction is "fix the repo" (`1`) versus "fix the invocation" (`2`). `rdy list` and `rdy init` produce only `0` and `2`. A run that cannot complete a kit exits `2` even when the kits that ran found problems, and still reports what it collected.

## Listing kits

Each section names the command that runs the kits beneath it:

```
── Internal
   To run: rdy run --jit <name>
📄 deploy
📄 smoke

── Compiled
   To run: rdy run <name>
📓 deploy
📓 smoke
```

Kits from configured packages get their own section, each named package-first so a kit reads the same here as in the heading that `rdy run` gives it, and any installed dependency that publishes kits and that the config omits is named as a candidate:

```
── Packages
   To run: rdy run --packages [<name>]
📦 @acme/eslint-config@2.1.0 / 📓 drift

── Available
   Add to "packages" in the readyup config
📦 @acme/release-kit
```

`--packages` covers the dependency question on its own, and covers it for both groups at once. `rdy list --packages` reports every installed direct dependency that publishes kits, plus every package named in the config, one block apiece with the kits that it publishes and the descriptions recorded in their manifests:

```
━━ 📦 @acme/eslint-config@2.1.0
   To run: rdy run --packages <name>
📓 drift · Dependency drift

━━ 📦 @acme/release-kit@4.0.1 · not listed in the readyup config
   To run: rdy run --from npm:@acme/release-kit [<name>]
📓 default
📓 npm-auto-publish
```

The hint above each block marks the package. A package named in the config is headed by `rdy run --packages`, which is exactly the run that would include it; one omitted from the config is headed by the source that names it directly, and reads `not listed in the readyup config`. Every kit listed is therefore runnable by the command above it, and learning what an unconfigured package contains no longer requires a `--from npm:` listing per package.

Configured packages are resolved through `node_modules` rather than through the project's declared dependencies, so one that is installed without being declared is reported here as it is under a plain `rdy list`; when that lookup fails, a name matching one of the project's own workspaces resolves to that workspace, and a name matching neither produces a warning and is omitted. On its own, `--packages` reads the working directory, and it is not combinable with `--from` or `--manifest`. Pairing it with `--recursive` sweeps the whole repository, which [Listing a repository's dependencies](#listing-a-repositorys-dependencies) covers.

`--manifest` reports each kit's compile-time ReadyUp version and description:

```
── Manifest: .readyup/manifest.json
📓 deploy (readyup v0.22.0) · Pre-deployment checks
📓 smoke (readyup v0.22.0)
```

A local `--from` source with no manifest falls back to listing the compiled kits on disk; those rows have a name and path only. A remote source still requires a manifest.

### Listing a whole repository

`--recursive` sweeps down from the working directory and reports each project's compiled kits under a heading naming the directory that contains them, with the descriptions recorded in that project's manifest:

```
━━ 📁 ./
   To run: rdy run <name>
📓 demo

━━ 📁 packages/readyup/
   To run: rdy run --from packages/readyup [<name>]
📓 default · Authoring hygiene for a project that defines readyup kits
📓 publishing · Publication readiness for a package that ships readyup kits
```

Every listed kit is runnable by the command above it, from wherever the sweep was run. The kits of a project that sets a custom `compile.outDir` are run by file instead, since that is the only resolution path that respects it, and its rows are named by a path that resolves from the sweep root:

```
━━ 📁 packages/tooling/
   To run: rdy run --file <file path>
📓 packages/tooling/dist/kits/lint.js · Shared lint and format gate
```

Internal kits and configured-package kits are absent: No invocation runs another project's uncompiled sources, and packages are the other axis of discovery rather than this one. A project with nothing compiled is not rendered at all, so a sweep of a repository whose kits are all uncompiled prints `No kit projects found.`

The sweep considers every directory containing a `package.json`, the working directory included, and skips `node_modules` and dot-directories. Each project that it finds is read under its own `.config/readyup.config.ts`. Topology comes from the filesystem rather than a workspace file, so the sweep works the same whatever package manager the repository uses -- but a kit directory with no `package.json` beside it is not a candidate. `--recursive` cannot be combined with `--from` or `--manifest`, which name a single foreign source.

### Listing a repository's dependencies

`--recursive --packages` combines the two axes: the locality of the sweep and the provenance of the dependency view. It reports each project's kit-publishing dependencies under the directory that declares them, with the command that runs each package's kits:

```
📁 ./
   📦 @acme/eslint-config@2.1.0
      To run: rdy run --packages [<name>]
      📓 drift · Dependency drift

📁 packages/tooling/
   📦 @acme/release-kit@4.0.1 · not listed in the readyup config
      To run: cd packages/tooling && rdy run --from npm:@acme/release-kit [<name>]
      📓 default
      📓 npm-auto-publish
```

Every project's dependencies and configured packages are read from its own `package.json` and its own `.config/readyup.config.ts`, so a package that one workspace names and another does not reads `not listed in the readyup config` only where it is unnamed. A workspace's own dependency resolves from no other directory, so its command includes the `cd` into that workspace: `rdy run` takes no directory, and `--from` names a kit source rather than a working directory.

This sweep is wider than the one that `--recursive` makes alone. It considers every directory containing a `package.json`, whether or not that directory has readyup configuration or kits, because a workspace authoring no kits of its own still declares dependencies that publish them -- and that workspace is the one that the question is about. A project with no kit-publishing dependency is not rendered at all, its directory line included, and a sweep that finds nothing prints `No dependency of any project below this directory publishes kits.`

Unlike every other listing, this view has no heading rules. The two rule weights that it would otherwise need are a stroke apart, and the roles that they would mark are already distinguished by their glyphs; under `--style plain`, which leaves the role glyphs empty, the indentation marks all three levels on its own. That is also why each command is labelled `To run:`: It shares a column with the kits beneath it, and the label keeps it from reading as one more kit.

Rows are keyed by `name`, `kind`, `project`, **and** `origin.package` together. Under the default configuration a compiled source appears twice -- once as `internal` and once as `compiled`. A package's kit is `compiled` like any other bundle, distinguished by the package that it records rather than by a kind of its own, so `name` and `kind` alone collide between a project's own kit and a package's kit of the same name; under `--recursive` they collide again between two projects that each have a `default`, and under `--recursive --packages` between two workspaces depending on the same package. A consumer indexing on less than the full key silently drops a row.

Every kit published by a package has `origin.configured`, reporting whether the config names that package and so whether `rdy run --packages` would include it. It is emitted under `--packages`, under `--recursive --packages`, and under a plain `rdy list` alike, so a consumer never has to know which invocation wrote the payload; it is absent only from a payload written before the field existed. Candidates from the **Available** section are not kits and appear separately in `availablePackages`, which appears only in the owner listing: Under `--packages` those packages' kits are rows of their own, so there is nothing left to name separately.
