# Publishing kits

The path from source to a consumer:

1. Author `.readyup/kits/<name>.ts`.
2. Run `rdy compile` to bundle it to `<name>.js` and record its hashes in `.readyup/manifest.json`.
3. Commit both the compiled `.js` and the manifest.
4. Consumers run `rdy run --from github:org/repo`, which fetches the bundle described by the manifest.
5. Run `rdy verify` in CI to catch a bundle edited by hand or a source left uncompiled, or `rdy verify --rebuild` to catch a bundle stale in anything the hashes do not record. In a monorepo, `rdy verify --recursive` verifies every package's kits in one run.

A published package can include its kits instead, so consumers access them through the dependency that they already have rather than through a repository URL. See [package-hosted kits](#package-hosted-kits).

## Compiling

```
── Compiling kits in packages/api/.readyup/kits
🟢 deploy.ts -> 📓 deploy.js
⚪ smoke.ts · no changes
```

Because the directory is named relative to the enclosing workspace root, a workspace compiled from its own directory still gets a heading that tells it apart from the others. In a repository with no workspace file, the directory is named relative to the repository root; a directory under neither is named relative to the working directory. To compile every project in a repository at once, see [Compiling a whole repository](#compiling-a-whole-repository).

`rdy compile` reads its `compile` settings from the file named by `--config` in place of `.config/readyup.config.ts`, as [Config](authoring-kits.md#config) describes. `rdy compile <file>` reads `compile.outDir` alone, which gives the kit its name; `compile.include` and `compile.exclude` select a sweep's sources and affect nothing else. `--config` cannot be combined with `--recursive`, which compiles each project under its own config.

A sweep runs to completion: A kit that fails is reported, the next is tried, and the run exits 1. A failed kit is never recorded as though it had compiled, and one compiled previously keeps its existing manifest entry.

A sweep names each kit after its source's path below [`compile.srcDir`](authoring-kits.md#config), extension stripped, so `deploy.ts` is named `deploy` and `ops/deploy.ts` is named `ops/deploy`. The separator is `/` on every platform, and a nested kit is run under the whole name: `rdy run ops/deploy`. Two sources therefore cannot claim one name, and organizing kits into subdirectories needs nothing from the config.

A sweep also prunes the kits that no source compiles to any longer, because the source was deleted or `compile.include` and `compile.exclude` no longer select it. The sweep drops each such kit's manifest entry and deletes its bundle, provided the bundle still matches the recorded `targetHash` or the entry records no hash:

```
🟢 deploy.ts -> 📓 deploy.js
🟢 legacy.js · removed, no source compiles to it
```

A bundle edited since it was compiled is kept with its entry and counts against the run as a drifted kit does; `--force` deletes it. A bundle that cannot be deleted also keeps its entry and fails the run. An entry recording a bundle outside the output directory is dropped without deleting the file, since a sweep writes nothing there. A single-file compile deletes nothing, and neither does `--skip-manifest`, which reads no record of what was compiled. A bundle that the manifest does not record is reported rather than deleted; see [`bundle-unrecorded`](#compile-warnings).

A sweep that finds no kits writes a manifest only if one already exists, and prunes by the same rules, so kits since deleted stop being advertised and lose their bundles. Because a project with neither kits nor a manifest is left alone, sweeping a monorepo does not create `.readyup/` in workspaces that contain no kits.

`rdy compile` refuses to overwrite a compiled kit whose on-disk hash differs from the manifest's recorded `targetHash` -- someone edited the bundle directly:

```
🟠 deploy.ts
   drift in deploy.js: expected 6f58905a, got eb104f57

1 of 2 kits skipped due to drift. Re-run with --force to overwrite, or move edits into the source.
```

For a kit that no source compiles to, the drift reason ends with `no source compiles to it`, and the closing line suggests `--force` to remove the bundle, or restoring the source.

Under `--json`, each kit reports `name`, `status` (`compiled`, `skipped`, or `failed`), and the reason it was skipped or failed. A top-level `removed` lists each bundle that the sweep deleted as `{ name, path }`, with `path` relative to the working directory, and is absent when it deleted none. The payload also lists any [warnings](#compile-warnings).

### Compiling a whole repository

`rdy compile --recursive` compiles every kit project below the working directory in one run, heading each project's output with its directories named relative to the working directory:

```
── Compiling kits in .readyup/kits
🟢 demo.ts -> 📓 demo.js

── Compiling kits in packages/api/.readyup/kits
🟢 deploy.ts -> 📓 deploy.js
⚪ smoke.ts · no changes
```

The sweep considers the same directories as [`rdy list --recursive`](running-checks.md#listing-a-whole-repository), and compiles each one that has a `.readyup/` directory or a `.config/readyup.config.ts` and contains kit sources, compiled kits, or a manifest. Each project compiles exactly as `rdy compile` run from its own directory would: under its own config, writing its own manifest by the rules above. A project whose kits were all deleted therefore has its manifest emptied and their bundles removed, and a workspace with no kits gets no manifest.

Every project is compiled by the readyup that runs the sweep, and by that readyup's esbuild, so every manifest records the same `readyupVersion` and `esbuildVersion`. `pnpm -r exec rdy compile` instead runs each workspace's own installed readyup, and the two agree unless the workspaces install different versions of readyup.

The sweep runs to completion across projects as well as kits. A project that cannot be compiled at all is reported as `Error in <directory>: <message>`, and the sweep moves on to the next project: This covers a config that cannot be evaluated, a source directory that cannot be read, and a manifest that cannot be written. A project whose config cannot be evaluated compiles nothing, rather than compiling under default settings. When any project has a failed kit, a drifted kit, or a failure of its own, the run ends with a line naming those projects and exits 1:

```
Problems in 2 of 5 projects: packages/api, packages/broken
```

A sweep that finds no kit project prints `No kit projects found.` and exits 0. `--recursive` cannot be combined with an input file, `--output`, or `--manifest`, each of which names a single target, or with `--config`.

Under `--json`, each kit and each removed bundle also reports `project`, the directory of its project relative to the working directory (`.` for the working directory itself), so a kit is identified by `name` and `project` together. A `projects` list reports every project that the sweep visited, with `passed` and, for a project that could not be compiled at all, `error`. A project that contributed no kit entry still appears in `projects`.

### What a manifest entry records

| Field                 | Meaning                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `bundledDependencies` | Each package that the bundle inlined, by name, with the version declared by its `package.json`                |
| `checklists`          | The names of the checklists that the kit declares, so that `rdy list` reports them without running the bundle |
| `description`         | The kit's own description, if it declares one                                                                 |
| `esbuildVersion`      | The esbuild that produced the bundle                                                                          |
| `inputs`              | Every file read by the compile, each with the hash of what was consumed from it                               |
| `name`                | The kit's name, which is its source's path below `compile.srcDir` with the extension stripped                 |
| `path`                | The compiled bundle, relative to the manifest                                                                 |
| `readyupVersion`      | The readyup that compiled the kit                                                                             |
| `source`              | The TypeScript from which the bundle was built, relative to the manifest                                      |
| `sourceHash`          | Hash of that source, read back out of its own `inputs` record                                                 |
| `targetHash`          | Hash of the compiled bundle                                                                                   |

Every hash that the manifest records is a prefix of a SHA-256 hex digest, between 8 and 64 characters. Readers compare the digest at the recorded value's own length rather than at a length of their own, so a manifest written by a readyup recording a longer prefix verifies clean instead of reading as wholly stale. Without the floor, a record too short to distinguish anything would pass every check that reads it.

`inputs` is the compile's input closure: every module that the bundle inlined past the entry, and every JSON file projected by [`pickJson`](authoring-kits.md#inlining-json-at-compile-time). A module records the hash of its contents. An inlined JSON file records the hash of the projection that was substituted, with the path specifier that produced it, so an edit to a field that the kit did not pick is not staleness.

The closure stops at `node_modules`. A dependency's contents are pinned by the lockfile and read exactly by [`rdy verify --rebuild`](#verifying-by-recompiling), while recording them would size a committed, per-compile-rewritten manifest to the dependency tree rather than to the kit: One `import zod` inlines 79 files.

What the closure leaves out is recorded as versions instead: `esbuildVersion` names the bundler and `bundledDependencies` each inlined package, one entry per package rather than one per file. When a bundle inlines one package at two versions at once, that package's entry records both versions, sorted and comma-separated. `bundledDependencies` is absent for a kit that bundles nothing, so the presence of `esbuildVersion` shows that an entry has the record at all.

An entry compiled before readyup recorded the closure has no `inputs`; one compiled before the version record has no `esbuildVersion`.

### Compile warnings

`rdy compile` raises advisories about the kits that it compiles and the bundles that it finds. Warnings go to stderr in both modes and appear under a top-level `warnings` in JSON, each as `{ code, message, remedy? }`, absent when none was raised. No warning affects `passed` or the exit code.

| Code                | Raised when                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `bundle-unrecorded` | A bundle directly under the output directory is neither compiled from a source nor recorded in the manifest |
| `json-inlined`      | A kit's bundle includes a JSON file from outside `node_modules` whole                                       |

A JSON file that a kit imports, with or without an import attribute, or loads through `require()`, is bundled whole and recorded whole in `inputs`: The kit includes every field, and any edit to the file leaves the kit stale. The warning names the kit, the file, and each module that imports it, and suggests [`pickJson`](authoring-kits.md#inlining-json-at-compile-time), which inlines and records only the fields that it names. A kit that failed to compile raises none, and one reported as `no changes` still raises it, because its bundle still includes the file.

Nothing shows that `rdy compile` wrote a bundle that the manifest does not record, so the sweep reports it rather than deleting it. Such a bundle typically belongs to a kit deleted before `rdy compile` pruned bundles, was compiled under `--skip-manifest`, or was copied in by hand, and `rdy run` still loads it by name. The warning names the bundle and its directory. A bundle named for a kit whose source the sweep found is not reported, even when that kit failed to compile. Neither a single-file compile nor `--skip-manifest` raises the warning.

## Package-hosted kits

A package can publish the kit that checks its own configuration, which keeps the check with the thing that it describes. The consumer then runs it against the version that they actually have, rather than naming a ref and hoping it matches.

Publishing takes one line. Compile as usual, then add the kit directory to the package's `files` allowlist:

```json
{
  "files": ["bin", "dist", ".readyup"]
}
```

`.readyup/manifest.json` is published alongside the bundles, and `rdy list` reads it, so publishing the whole directory makes a package's kits discoverable without running them.

Consumers select a single package directly:

```bash
rdy run --from npm:@acme/eslint-config       # the package's default kit
rdy run --from npm:@acme/eslint-config drift # a kit that it publishes, by name
rdy list --from npm:@acme/eslint-config      # what it publishes
```

Like every other `--from` source, a bare invocation runs the kit named `default`; a package publishing under other names needs one of them named, or `--all`, which runs every kit that it publishes. [Configured kit sources](#configured-kit-sources) makes the same selection across several packages at once.

An `npm:` source resolves through `node_modules`, which sets two limitations. The package must be a **direct** dependency: A transitive package is genuinely unreachable, because a strict pnpm layout links nothing else into the project. And package sources do not resolve under Yarn Plug'n'Play, because it keeps no `node_modules` on disk. A configured `npm:` source that `node_modules` does not contain falls back to the project's own workspaces, as [Packages](#packages) describes.

A published version other than the installed one is not yet reachable through `npm:`, and `rdy` says so when one is named. Use `--url` with the published address in the meantime:

```bash
rdy run --url https://unpkg.com/@acme/eslint-config@2.1.0/.readyup/kits/drift.js
```

## Configured kit sources

To run the kits of several sources together, name them in the config's `sources` list, because running code that someone else publishes is an opt-in worth writing down. Each entry is a kit source spelled as `--from` takes it, limited to the schemes that name a publisher: `npm:` for an installed package, and `github:` or `bitbucket:` for a repository, with an optional `@ref`.

```ts
export default defineRdyConfig({
  sources: ['npm:@acme/eslint-config', 'npm:@acme/release-kit', 'github:acme/.github@v2'],
});
```

```bash
rdy run --sources       # the kit named `default`, from every listed source
rdy run --sources drift # the kit named `drift`, from every listed source publishing it
rdy run --sources --all # every kit, from every listed source
```

The kit name is the selector, exactly as it is for every other source, and each result names the source from which it came, a package with its installed version. A checklist filter is rejected in both spellings -- `--checklists` and inline `kit:checklist` -- because several listed sources may publish the named kit, which leaves no single kit within which to select checklists.

A listed source that does not publish the requested kit is skipped. `rdy run --sources` checks whether this project satisfies what its listed sources require of it, and a source publishing no `default` requires nothing of it: That source contributes no kit, and a run that selects nothing says so and passes. The named form differs in one respect, because naming a kit asks for something specific: A name published by no listed source is a usage error rather than an empty run.

An author uses that rule to keep a kit out of a routine `--sources` run: Publish it under a name other than `default`. It stays listed by `rdy list`, reachable by name both here and through `--from`, and run by `rdy run --sources --all`. Nothing is needed from the consumer's config, and nothing needs republishing.

A listed source that cannot be read, or that publishes no kits at all, fails the run, and the error names the entry as the config spells it; `rdy list` warns instead and reports the rest, then names, as `npm:<name>`, any installed dependency that publishes kits but is in neither `sources` nor `omittedSources`. An entry without a scheme, or with a scheme other than these three, is a config error naming the entry, and so is a config that still contains the `packages` key that `sources` replaced.

`omittedSources` names the installed dependencies whose kits the project does not run, on purpose, each as `npm:<name>`. `rdy list` stops proposing them, and the `setup` checklist of [readyup's own `default` kit](#readyups-own-kits), which reports every kit-publishing dependency missing from `sources`, stops reporting them. An entry naming anything but a package is a config error:

```ts
export default defineRdyConfig({
  omittedSources: ['npm:@acme/experimental-kits'],
  sources: ['npm:@acme/eslint-config', 'npm:@acme/release-kit'],
});
```

### Packages

An `npm:` entry resolves through `node_modules`, under the limitations that [package-hosted kits](#package-hosted-kits) states. If `node_modules` contains no match, an entry naming one of the project's own workspaces resolves to that workspace's directory, and its kits are read from there as for any installed package. A monorepo therefore runs its own packages' kits over itself without declaring a dependency on them purely to make them findable. The workspace matches by the `name` declared in its manifest, `private: true` included, and resolution is anchored to the directory whose config named the package, so a `--recursive` sweep reads each project's own workspaces.

### Repositories

A `github:` or `bitbucket:` entry reads the kits that the repository has committed under `.readyup/` at the named ref, or at `main` when the entry names none. An unpinned entry therefore runs whatever `main` holds when the run starts, while a tag or a commit SHA keeps every run on the same kits. The repository must commit its `.readyup/manifest.json`, because the hosts' file endpoints cannot list a directory: The manifest is how readyup learns which kits the repository publishes. Fetches use the cache and the credentials that `--from` uses, and `--no-cache` fetches again.

A repository kit namespaces its check IDs under the repository's owner and name, so a pragma suppressing one of its checks writes the full form, as [Suppressing a finding](running-checks.md#suppressing-a-finding) describes.

## ReadyUp's own kits

ReadyUp publishes two kits of its own, about readyup projects themselves. Any project with readyup as a direct dependency can access them:

```bash
rdy run --from npm:readyup            # default: setup hygiene, advisory
rdy run --from npm:readyup publishing # publication readiness, blocking
rdy list --from npm:readyup           # both, with the checklists that each one has
```

`default` reports at `warn` and below, so it is safe to run mid-edit:

| Checklist   | What it asserts                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup`     | A config file is present (at `recommend`), a manifest records what has been compiled, and `packages` lists every installed dependency that publishes kits.                      |
| `freshness` | Every kit that the manifest records still matches what was recorded for it (its source, its bundle, and everything the compile inlined), and the manifest records every bundle. |

The config and manifest checks skip for a project that defines no kits of its own: A monorepo root that lists `sources` rather than authoring kits is not expected to keep any at its root, and a project is judged to define kits once it contains either `.readyup/kits` or `.readyup/manifest.json`. The `sources` check skips instead when the config lists no sources, because that monorepo root is the project for which it exists. It reads the declared dependencies of the working directory and `.config/readyup.config.ts`, which `--config` does not replace, and it does not report a package that `omittedSources` names. The manifest check skips for a second reason, when nothing is compiled, since a project running its kits with `--jit` has nothing to record. So does `freshness`, which otherwise names one check per recorded kit, followed by one naming every bundle in `.readyup/kits` that no entry records. `rdy compile` deletes only the bundles that the manifest records, so an unrecorded one stays loadable by name until someone deletes it. Beneath each kit, the comparison over what it inlined skips for an entry compiled before readyup [recorded its inputs](#what-a-manifest-entry-records); an inlined JSON file is judged by the projection that was substituted rather than by the file containing it, through the same `projectJsonFile` that the compile used to record it.

`publishing` reports at `error`, for a package that distributes its kits:

| Checklist          | What it asserts                                                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packaging`        | `files` includes the kit directory, the manifest is present, a kit named `default` exists (at `warn`), every recorded kit is in `.readyup/kits` under its own name, and the README fits inside the registry's 65,536-code-point `readme` field. |
| `freshness`        | The comparisons that `default` makes, at blocking severity: A stale kit publishes checks that no longer describe the package with which they are distributed.                                                                                   |
| `self-containment` | Every bundle imports only `node:*`, `readyup`, and `readyup/*` -- the specifiers that [`rdy compile`](#compiling) leaves external.                                                                                                              |

A package declaring no `files` field passes the first check, because everything is published. That check is a containment test rather than an npm-packlist emulation: A `files` list built from globs or negations needs a `.readyup` entry beside them to satisfy it.

Both kits read the convention layout: `.readyup/manifest.json` and bundles directly under `.readyup/kits`. A project that compiles to a different `outDir` still gets its recorded kits checked for freshness, since those paths come from the manifest, but the checks that count compiled bundles report nothing to do. For a published package the layout is not a convention but a contract, and the `packaging` check over recorded paths enforces it: `--from npm:` composes a kit's path from its name, so a bundle recorded anywhere else is listed and then fails to load.

Adding `npm:readyup` to `sources` in the config makes `rdy run --sources` include readyup's `default` kit. `publishing` is not part of that run, under the rule that excludes every kit not named `default`; select it with `rdy run --sources publishing`, which runs it from each listed source publishing a kit by that name, or with `rdy run --sources --all`, which runs every kit of every listed source. Until readyup is listed, `rdy list` names it among the dependencies that publish kits, and `rdy list --sources` shows the kits that it contains.

## Internal kits

Internal kits are TypeScript sources that a repo runs on itself rather than publishing. The `internal.dir` and `internal.infix` [config keys](authoring-kits.md#config) locate them below `compile.srcDir`, which is where the repo's sources live; `--internal` shifts the name by the directory and the filename by the infix, and leaves the root that [Selecting what runs](running-checks.md#selecting-what-runs) states.

An **infix** is a segment between the kit name and the extension. With `infix: 'internal'`, the kit `deploy` lives at `deploy.internal.ts`; with no infix configured -- the default -- it is simply `deploy.ts`.

```ts
export default defineRdyConfig({
  internal: { dir: 'internal', infix: 'internal' },
});
```

`rdy run --internal <kit>` resolves through these settings, and `rdy list` groups sources under **Internal** and bundles under **Compiled**.

## Verifying

```
── Verifying kits against .readyup/manifest.json
🔴 deploy
   drift (expected 6f58905a, got eb104f57)
   💊 Move the edits into the source, then run `rdy compile --force`.
🟢 smoke

1 of 2 kits failed verification.
```

The output for a failing kit ends with what to do about it, marked with the token that `rdy run` puts on a check's `fix`. The remedies follow every verdict rather than appearing next to the one that produced each, and a remedy shared by several of a kit's verdicts is named once. A file named by more than one axis is remedied once too, by the axis that gives the more exact account of it, and a remedy whose whole action is a bare `rdy compile` is dropped once the bundle has drifted, since the drift gate refuses that command and the `--force` remedy recompiles from the same source. Remedies that the force recompile does not settle still print.

Each kit has three independent verdicts. The compiled output is `ok`, `drift`, `missing`, or `unverified`; the source is `ok`, `stale`, `missing`, or `unverified`; the [recorded inputs](#what-a-manifest-entry-records) are `ok`, `stale`, or `unverified`. `drift` means someone edited the bundle by hand; a stale source means the TypeScript changed and nobody recompiled; stale inputs mean the same for a module that the bundle inlined or a JSON projection that it substituted. A kit can be all three at once.

The inputs verdict names every input that failed rather than the first, each on its own line, separating a changed module from a changed inline projection. A projected file that is still present while the fields picked by the kit are gone is reported as `unprojectable`, which says something about the kit rather than about the file:

```
🔴 deploy
   input stale: checks/shared.ts (module, expected 6f58905a, got eb104f57)
   input unprojectable: ../../package.json (Path not found in JSON: version)
   💊 Run `rdy compile` to rebuild it.
   💊 Restore the picked fields in ../../package.json, or repoint the kit's `pickJson` call.
```

Recompiling resolves a changed input but not an unprojectable one, because the file is present and the fault is in the kit, which names fields that are no longer there.

Anything other than `ok` or `unverified` on any axis fails the run. `unverified` does not, since an entry with no recorded hash -- or one compiled before readyup recorded the input closure -- says nothing about whether the kit changed.

Under `--json`, each kit reports `status`, `sourceStatus`, and `inputsStatus`. A `drift` verdict reports `expected` and `actual`; a stale source reports `sourceExpected` and `sourceActual`; stale inputs report `inputFailures`, one entry per input naming its `kind`, `path`, and `reason`, plus whichever of `expected`, `actual`, and `detail` that reason has. The remedies are human output alone: A consumer reads the verdict and writes its own.

In CI:

```yaml
- run: npx rdy verify
```

`rdy verify` enforces, whereas `rdy run` advises: A stale source fails verification and exits 1, while a run emits a warning and proceeds. A verification tool that refused to run because its own bookkeeping was out of date would be worse than one that ran and said so.

### Verifying by recompiling

The three verdicts cover what the compile read and recorded as hashes. A bundle is a function of more than that: the bundler's version, the compile options, and the contents of every dependency, none of which the hash verdicts cover, since [the closure stops at `node_modules`](#what-a-manifest-entry-records). A bundle stale in any of them still hashes as `ok`.

`--rebuild` settles the question exactly. It recompiles each kit in memory and compares the result to the committed bundle byte for byte:

```
── Verifying kits against .readyup/manifest.json

🔴 deploy
   rebuild mismatch (rebuilt 8c31f0a2, on disk 6f58905a; esbuild 0.28.1 -> 0.29.0; zod 3.24.1 -> 4.0.0)
   💊 Run `rdy compile` to rebuild it.
🟢 smoke
```

A mismatch names which recorded versions changed, read from what the manifest records: the readyup that compiled the bundle, the esbuild, and each bundled package whose version the rebuild does not reproduce. When every recorded version matches, the mismatch says so, which leaves an edited bundle, a changed input, or dependency content changed without a version bump. The comparison reads the rebuild's own record on both sides, so nothing is resolved from the installed tree, and a mismatch for an entry compiled before the version record shows the bare hashes.

Because the comparison is against the bundle on disk, never the recorded hash, the verdict is independent of the manifest's bookkeeping and can contradict it. When a bundle reproduces exactly but its recorded hash does not match, the record is at fault, not the kit:

```
🔴 deploy
   drift (expected 6f58905a, got eb104f57)
   rebuild ok
   💊 The bundle reproduces, so its recorded hash is what is stale. Run `rdy compile --force` to re-record it.
```

The remedy changes with it. Otherwise the remedy for a drifted bundle is to move the edits into the source, since only a hand edit explains the drift; here there is nothing to move, and `--force` rewrites the record rather than the kit. Either way the command includes `--force`, because `rdy compile` gates on drift and skips the kit rather than overwriting it.

The verdict is `ok`, `mismatch`, `failed` (the source no longer compiles), or `missing` (nothing to recompile, or nothing to compare against). Only `ok` passes. There is no `unverified` here: An exactness check that waived the kits that it could not reach would establish less than it appears to.

Under `--json`, each kit adds `rebuildStatus`. A `mismatch` reports `rebuildExpected` and `rebuildActual`, plus `rebuildCompiledWith` when the bundle was built by a different readyup, `rebuildEsbuild` (the recorded esbuild against the rebuild's) whenever the entry records one, and `rebuildDependencyChanges` when at least one bundled package's version moved; a `failed` reports `rebuildError`. Without the flag, none of these fields appears.

Three things to know before wiring it into CI: It requires esbuild, which a repository that compiles kits already has. The readyup version forms part of a bundle's hash, so a readyup upgrade makes every kit mismatch until recompiled; an esbuild or dependency upgrade causes a mismatch in every bundle that it changes, and the mismatch clause names it. And it must not run after a step that recompiles kits, because recompilation would defeat the comparison.

The directory in which the command runs is not one of them. `rdy verify --rebuild` returns the same verdict from anywhere in the repository, because the same source in the same package always compiles to the same bundle.

```yaml
- run: npx rdy verify --rebuild
```

### Verifying a whole repository

`rdy verify --recursive` verifies every kit project below the working directory in one run, each against its own manifest, and heads each project's output with that manifest's path relative to the working directory:

```
── Verifying kits against .readyup/manifest.json
🟢 demo

── Verifying kits against packages/api/.readyup/manifest.json
🔴 deploy
   drift (expected 6f58905a, got eb104f57)
   💊 Move the edits into the source, then run `rdy compile --force`.

1 of 1 kits failed verification.
Error in packages/ui: No manifest at packages/ui/.readyup/manifest.json. Run `rdy compile` in packages/ui to create it.

Problems in 2 of 3 projects: packages/api, packages/ui
```

The sweep visits the same projects as [`rdy compile --recursive`](#compiling-a-whole-repository), which considers the directories that [`rdy list --recursive`](running-checks.md#listing-a-whole-repository) considers, so a package that starts authoring kits is verified without a change to the CI step. Each project is verified exactly as `rdy verify` run from its own directory would verify it.

The sweep runs to completion across projects. A project that cannot be verified at all is reported as `Error in <directory>: <message>`, and the sweep moves on to the next project: This covers a config that cannot be evaluated, a manifest that cannot be read, and a project that contains kits but no manifest, whose remedy is to run `rdy compile` in its directory. A project whose config cannot be evaluated is not verified, rather than verified under default settings. When any project has a failed kit or a failure of its own, the run ends with a line naming those projects and exits 1.

A sweep that finds no kit project prints `No kit projects found.` and exits 0. `--recursive` works with `--rebuild` and `--json`, and cannot be combined with `--manifest`, which names a single manifest.

Under `--json`, each kit also reports `project`, the directory of its project relative to the working directory (`.` for the working directory itself), so a kit is identified by `name` and `project` together. A `projects` list reports every project that the sweep visited, with `passed` and, for a project that could not be verified at all, `error`.

In a monorepo's CI, the sweep replaces one `rdy verify --manifest` step per package. With `--rebuild`, it must still run before any step that recompiles kits:

```yaml
- run: npx rdy verify --recursive --rebuild
```
