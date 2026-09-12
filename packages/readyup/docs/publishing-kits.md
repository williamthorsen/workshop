# Publishing kits

The path from source to a consumer:

1. Author `.readyup/kits/<name>.ts`.
2. Run `rdy compile` to bundle it to `<name>.js` and record its hashes in `.readyup/manifest.json`.
3. Commit both the compiled `.js` and the manifest.
4. Consumers run `rdy run --from github:org/repo`, which fetches the bundle described by the manifest.
5. Run `rdy verify` in CI to catch a bundle edited by hand or a source left uncompiled, or `rdy verify --rebuild` to catch a bundle stale in anything the hashes do not record.

A published package can include its kits instead, so consumers access them through the dependency that they already have rather than through a repository URL. See [package-hosted kits](#package-hosted-kits).

## Compiling

```
── Compiling kits in packages/api/.readyup/kits
🟢 deploy.ts -> 📓 deploy.js
⚪ smoke.ts · no changes
```

The directory is named relative to the enclosing workspace root, so `pnpm -r exec rdy compile` gives each workspace's output a distinct heading. In a repository with no workspace file, the directory is named relative to the repository root; a directory under neither is named relative to the working directory.

A sweep runs to completion: A kit that fails is reported, the next is tried, and the run exits 1. A failed kit is never recorded as though it had compiled, and one compiled previously keeps its existing manifest entry.

A sweep that finds no kits writes a manifest only if one already exists, emptying it so that kits since deleted stop being advertised. A project with neither kits nor a manifest is left alone, so sweeping a monorepo does not create `.readyup/` in workspaces that contain no kits.

`rdy compile` refuses to overwrite a compiled kit whose on-disk hash differs from the manifest's recorded `targetHash` -- someone edited the bundle directly:

```
🟠 deploy.ts
   drift in deploy.js: expected 6f58905a, got eb104f57

1 of 2 kits skipped due to drift. Re-run with --force to overwrite, or move edits into the source.
```

Under `--json`, each kit reports `name`, `status` (`compiled`, `skipped`, or `failed`), and the reason it was skipped or failed.

### What a manifest entry records

| Field                 | Meaning                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `bundledDependencies` | Each package that the bundle inlined, by name, with the version declared by its `package.json`           |
| `checklists`          | The names of the checklists that the kit declares, so `rdy list` reports them without running the bundle |
| `description`         | The kit's own description, if it declares one                                                            |
| `esbuildVersion`      | The esbuild that produced the bundle                                                                     |
| `inputs`              | Every file read by the compile, each with the hash of what was consumed from it                          |
| `name`                | The kit's name, which is its compiled file's basename                                                    |
| `path`                | The compiled bundle, relative to the manifest                                                            |
| `readyupVersion`      | The readyup that compiled the kit                                                                        |
| `source`              | The TypeScript from which the bundle was built, relative to the manifest                                 |
| `sourceHash`          | Hash of that source, read back out of its own `inputs` record                                            |
| `targetHash`          | Hash of the compiled bundle                                                                              |

Every hash that the manifest records is a prefix of a SHA-256 hex digest, between 8 and 64 characters. Readers compare the digest at the recorded value's own length rather than at a length of their own, so a manifest written by a readyup recording a longer prefix verifies clean instead of reading as wholly stale. Without the floor, a record too short to distinguish anything would pass every check that it reaches.

`inputs` is the compile's input closure: every module that the bundle inlined past the entry, and every JSON file projected by [`pickJson`](authoring-kits.md#inlining-json-at-compile-time). A module records the hash of its contents. An inlined JSON file records the hash of the projection that was substituted, with the path specifier that produced it, so an edit to a field that the kit did not pick is not staleness.

The closure stops at `node_modules`. A dependency's contents are pinned by the lockfile and read exactly by [`rdy verify --rebuild`](#verifying-by-recompiling), while recording them would size a committed, per-compile-rewritten manifest to the dependency tree rather than to the kit: One `import zod` inlines 79 files.

What the closure leaves out is recorded as versions instead: `esbuildVersion` names the bundler and `bundledDependencies` each inlined package, one entry per package rather than one per file. When a bundle inlines one package at two versions at once, that package's entry records both versions, sorted and comma-separated. `bundledDependencies` is absent for a kit that bundles nothing, so the presence of `esbuildVersion` shows that an entry has the record at all.

An entry compiled before readyup recorded the closure has no `inputs`; one compiled before the version record has no `esbuildVersion`.

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

Like every other `--from` source, a bare invocation runs the kit named `default`; a package publishing under other names needs one of them named. `--packages` below is the same selection, made across several packages at once.

To name several packages once, list them in the config, because running code that a dependency publishes is an opt-in worth writing down:

```ts
export default defineRdyConfig({
  packages: ['@acme/eslint-config', '@acme/release-kit'],
});
```

```bash
rdy run --packages       # the kit named `default`, from every listed package
rdy run --packages drift # the kit named `drift`, from every listed package publishing it
```

The kit name is the selector, exactly as it is for every other source, and each result names the package and version from which it came. A checklist filter is rejected in both spellings -- `--checklists` and inline `kit:checklist` -- because several listed packages may publish the named kit, which leaves no single kit within which to select checklists.

A listed package that does not publish the requested kit is skipped. `rdy run --packages` checks whether this project satisfies what its listed packages require of it, and a package publishing no `default` requires nothing of it: That package contributes no kit, and a run that selects nothing says so and passes. The named form differs in one respect, because naming a kit asks for something specific: A name published by no listed package is a usage error rather than an empty run.

An author uses that rule to keep a kit out of a routine `--packages` run: Publish it under a name other than `default`. It stays listed by `rdy list` and reachable by name, both here and through `--from npm:<package>`. Nothing is needed from the consumer's config, and nothing needs republishing.

A listed package that is absent, or that publishes no kits at all, fails the run, and the run names it; `rdy list` warns instead and reports the rest, then names any installed dependency that publishes kits but is not in the list.

If `node_modules` contains no match, a configured name matching one of the project's own workspaces resolves to that workspace's directory, and its kits are read from there as for any installed package. A monorepo therefore runs its own packages' kits over itself without declaring a dependency on them purely to make them findable. The workspace matches by the `name` declared in its manifest, `private: true` included, and resolution is anchored to the directory whose config named the package, so a `--recursive` sweep reads each project's own workspaces.

Two limitations follow from resolving through `node_modules`, and neither applies to a workspace, because a configured package that `node_modules` does not contain is still resolved through the workspace fallback. A package that is not a workspace must be a **direct** dependency: A strict pnpm layout links nothing else into the project, so a transitive package is genuinely unreachable. And Yarn Plug'n'Play keeps no `node_modules` on disk, so package sources do not resolve under it.

A published version other than the installed one is not yet reachable through `npm:`, and `rdy` says so when one is named. Use `--url` with the published address in the meantime:

```bash
rdy run --url https://unpkg.com/@acme/eslint-config@2.1.0/.readyup/kits/drift.js
```

## ReadyUp's own kits

ReadyUp publishes two kits of its own, about readyup projects themselves. Any project with readyup as a direct dependency can access them:

```bash
rdy run --from npm:readyup            # default: authoring hygiene, advisory
rdy run --from npm:readyup publishing # publication readiness, blocking
rdy list --from npm:readyup           # both, with the checklists that each one has
```

`default` reports at `warn` and below, so it is safe to run mid-edit:

| Checklist   | What it asserts                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `setup`     | A config file is present (at `recommend`), and a manifest records what has been compiled.                                               |
| `freshness` | Every kit that the manifest records still matches what was recorded for it: its source, its bundle, and everything the compile inlined. |

Both `setup` checks stand down for a project that defines no kits of its own: A monorepo root that lists `packages` rather than authoring kits is not expected to keep any at its root, and a project is judged to define kits once it contains either `.readyup/kits` or `.readyup/manifest.json`. The manifest check stands down for a second reason, when nothing is compiled, since a project running its kits with `--jit` has nothing to record. So does `freshness`, which otherwise names one check per recorded kit. Beneath each kit, the comparison over what it inlined stands down for an entry compiled before readyup [recorded its inputs](#what-a-manifest-entry-records); an inlined JSON file is judged by the projection that was substituted rather than by the file containing it, through the same `projectJsonFile` that the compile used to record it.

`publishing` reports at `error`, for a package that distributes its kits:

| Checklist          | What it asserts                                                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packaging`        | `files` includes the kit directory, the manifest is present, a kit named `default` exists (at `warn`), every recorded kit is in `.readyup/kits` under its own name, and the README fits inside the registry's 65,536-code-point `readme` field. |
| `freshness`        | The comparisons that `default` makes, at blocking severity: A stale kit publishes checks that no longer describe the package with which they are distributed.                                                                                   |
| `self-containment` | Every bundle imports only `node:*`, `readyup`, and `readyup/*` -- the specifiers that [`rdy compile`](#compiling) leaves external.                                                                                                              |

A package declaring no `files` field passes the first check, because everything is published. That check is a containment test rather than an npm-packlist emulation: A `files` list built from globs or negations needs a `.readyup` entry beside them to satisfy it.

Both kits read the convention layout: `.readyup/manifest.json` and bundles directly under `.readyup/kits`. A project that compiles to a different `outDir` still gets its recorded kits checked for freshness, since those paths come from the manifest, but the checks that count compiled bundles report nothing to do. For a published package the layout is not a convention but a contract, and the `packaging` check over recorded paths enforces it: `--from npm:` composes a kit's path from its name, so a bundle recorded anywhere else is listed and then fails to load.

Adding readyup to `packages` in the config makes `rdy run --packages` include readyup's `default` kit. `publishing` is not part of that run, under the rule that excludes every kit not named `default`; select it with `rdy run --packages publishing`, which runs it from each listed package publishing a kit by that name. Until readyup is listed, `rdy list` names it among the dependencies that publish kits, and `rdy list --packages` shows the kits that it contains.

## Internal kits

Internal kits are TypeScript sources that a repo runs on itself rather than publishing. The `internal.dir` and `internal.infix` [config keys](authoring-kits.md#config) locate them.

An **infix** is a segment between the kit name and the extension. With `infix: 'internal'`, the kit `deploy` lives at `deploy.internal.ts`; with no infix configured -- the default -- it is simply `deploy.ts`.

```ts
export default defineRdyConfig({
  internal: { dir: 'internal', infix: 'internal' },
});
```

`rdy run --internal <name>` resolves through these settings, and `rdy list` groups sources under **Internal** and bundles under **Compiled**.

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

The comparison is against the bundle on disk, never the recorded hash, so the verdict is independent of the manifest's bookkeeping and can contradict it. When a bundle reproduces exactly but its recorded hash does not match, the record is at fault, not the kit:

```
🔴 deploy
   drift (expected 6f58905a, got eb104f57)
   rebuild ok
   💊 The bundle reproduces, so its recorded hash is what is stale. Run `rdy compile --force` to re-record it.
```

The remedy changes with it. Otherwise the remedy for a drifted bundle is to move the edits into the source, since only a hand edit explains the drift; here there is nothing to move, and `--force` rewrites the record rather than the kit. Either way the command includes `--force`, because `rdy compile` gates on drift and skips the kit rather than overwriting it.

The verdict is `ok`, `mismatch`, `failed` (the source no longer compiles), or `missing` (nothing to recompile, or nothing to compare against). Only `ok` passes. There is no `unverified` here: an exactness check that waived the kits that it could not reach would establish less than it appears to.

Under `--json`, each kit adds `rebuildStatus`. A `mismatch` reports `rebuildExpected` and `rebuildActual`, plus `rebuildCompiledWith` when the bundle was built by a different readyup, `rebuildEsbuild` (the recorded esbuild against the rebuild's) whenever the entry records one, and `rebuildDependencyChanges` when at least one bundled package's version moved; a `failed` reports `rebuildError`. Without the flag, none of these fields appears.

Three things to know before wiring it into CI: It requires esbuild, which a repository that compiles kits already has. The readyup version forms part of a bundle's hash, so a readyup upgrade makes every kit mismatch until recompiled; an esbuild or dependency upgrade causes a mismatch in every bundle that it changes, and the mismatch clause names it. And it must not run after a step that recompiles kits, because recompilation would defeat the comparison.

The directory in which the command runs is not one of them. The same source in the same package always compiles to the same bundle, so `rdy verify --rebuild` returns the same verdict from anywhere in the repository.

```yaml
- run: npx rdy verify --rebuild
```
