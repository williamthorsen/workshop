# Publishing kits

The path from source to a consumer:

1. Author `.readyup/kits/<name>.ts`.
2. Run `rdy compile` to bundle it to `<name>.js` and record its hashes in `.readyup/manifest.json`.
3. Commit both the compiled `.js` and the manifest.
4. Consumers run `rdy run --from github:org/repo`, which fetches the bundle the manifest describes.
5. Run `rdy verify` in CI to catch a bundle edited by hand or a source left uncompiled, or `rdy verify --rebuild` to catch a bundle stale in anything the hashes do not record.

A published package can ship its kits instead, so consumers reach them through the dependency they already have rather than through a repository URL. See [package-hosted kits](#package-hosted-kits).

## Compiling

```
── Compiling kits in packages/api/.readyup/kits
🟢 deploy.ts -> 📓 deploy.js
⚪ smoke.ts · no changes
```

The directory is named against the enclosing workspace root, so `pnpm -r exec rdy compile` heads each workspace's output distinguishably. A repository with no workspace file anchors on the repository root; a directory under neither is named against the working directory.

A sweep runs to completion: a kit that fails is reported, the next is tried, and the run exits 1. A failed kit is never recorded as though it had compiled, and one compiled previously keeps its existing manifest entry.

A sweep that finds no kits writes a manifest only where one already exists, emptying it so that kits since deleted stop being advertised. A project with neither kits nor a manifest is left alone, so sweeping a monorepo does not seed `.readyup/` in workspaces that hold no kits.

`rdy compile` refuses to overwrite a compiled kit whose on-disk hash differs from the manifest's recorded `targetHash` -- someone edited the bundle directly:

```
🟠 deploy.ts
   drift in deploy.js: expected 6f58905a, got eb104f57

1 of 2 kits skipped due to drift. Re-run with --force to overwrite, or move edits into the source.
```

Under `--json`, each kit reports `name`, `status` (`compiled`, `skipped`, or `failed`), and the reason it was skipped or failed.

### What a manifest entry records

| Field                 | Meaning                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `bundledDependencies` | Each package the bundle inlined, by name, with the version its `package.json` declares      |
| `checklists`          | The checklist names the kit declares, so `rdy list` reports them without running the bundle |
| `description`         | The kit's own description, where it declares one                                            |
| `esbuildVersion`      | The esbuild that produced the bundle                                                        |
| `inputs`              | Every file the compile read, each with the hash of what was consumed from it                |
| `name`                | The kit's name, which is its compiled file's basename                                       |
| `path`                | The compiled bundle, relative to the manifest                                               |
| `readyupVersion`      | The readyup that compiled the kit                                                           |
| `source`              | The TypeScript the bundle was built from, relative to the manifest                          |
| `sourceHash`          | Hash of that source, read back out of its own `inputs` record                               |
| `targetHash`          | Hash of the compiled bundle                                                                 |

Every hash the manifest records is a prefix of a SHA-256 hex digest, between 8 and 64 characters. Readers compare the digest at the recorded value's own length rather than at a length of their own, so a manifest written by a readyup recording a longer prefix verifies clean instead of reading as wholly stale. The floor is what keeps a record too short to distinguish anything from passing every check it reaches.

`inputs` is the compile's input closure: every module the bundle inlined past the entry, and every JSON file [`pickJson`](authoring-kits.md#inlining-json-at-compile-time) projected. A module records the hash of its contents. An inlined JSON file records the hash of the projection that was substituted, with the path specifier that produced it, so an edit to a field the kit did not pick is not staleness.

The closure stops at `node_modules`. A dependency's contents are pinned by the lockfile and read exactly by [`rdy verify --rebuild`](#verifying-by-recompiling), while recording them would size a committed, per-compile-rewritten manifest to the dependency tree rather than to the kit: one `import zod` inlines 79 files.

What the closure leaves out is recorded as versions instead: `esbuildVersion` names the bundler and `bundledDependencies` each inlined package, one entry per package rather than one per file. A package a bundle inlines at two versions at once records both, sorted and comma-separated. `bundledDependencies` is absent for a kit that bundles nothing, so `esbuildVersion` is the marker that an entry has the record at all.

An entry compiled before readyup recorded the closure has no `inputs`; one compiled before the version record has no `esbuildVersion`.

## Package-hosted kits

A package can publish the kit that checks its own configuration, which keeps the check with the thing it describes. The consumer then runs it against the version they actually have, rather than naming a ref and hoping it matches.

Publishing takes one line. Compile as usual, then add the kit directory to the package's `files` allowlist:

```json
{
  "files": ["bin", "dist", ".readyup"]
}
```

`.readyup/manifest.json` ships alongside the bundles and is what `rdy list` reads, so publishing the whole directory is what makes a package's kits discoverable without running them.

Consumers reach a single package directly:

```bash
rdy run --from npm:@acme/eslint-config       # the package's default kit
rdy run --from npm:@acme/eslint-config drift # a kit it publishes, by name
rdy list --from npm:@acme/eslint-config      # what it publishes
```

Like every other `--from` source, a bare invocation runs the kit named `default`; a package publishing under other names needs one of them named. `--packages` below is the same selection, made across several packages at once.

Naming several packages once is a config list, because running code a dependency ships is an opt-in worth writing down:

```ts
export default defineRdyConfig({
  packages: ['@acme/eslint-config', '@acme/release-kit'],
});
```

```bash
rdy run --packages       # the kit named `default`, from every listed package
rdy run --packages drift # the kit named `drift`, from every listed package publishing it
```

The kit name is the selector, exactly as it is for every other source, and each result names the package and version it came from. A checklist filter is rejected in both spellings -- `--checklists` and inline `kit:checklist` -- because several listed packages may publish the named kit, leaving the checklists no single one to select within.

A listed package that does not publish the requested kit is skipped. `rdy run --packages` asks whether this project satisfies what its listed packages require of it, and a package publishing no `default` requires nothing of it: that package contributes no kit, and a run that selects nothing reports as much and passes. The named form differs in one respect, because naming a kit asks for something specific: a name no listed package publishes is a usage error rather than an empty run.

That rule is how an author holds a kit back from a routine `--packages` run: publish it under a name other than `default`. It stays listed by `rdy list` and reachable by name, both here and through `--from npm:<package>`. Nothing is needed from the consumer's config, and nothing needs republishing.

A listed package that is absent, or that publishes no kits at all, fails the run and names itself; `rdy list` warns instead and reports the rest, then names any installed dependency publishing kits the list omits.

Where `node_modules` misses, a configured name matching one of the project's own workspaces resolves to that workspace's directory, and its kits are read from there as for any installed package. A monorepo therefore runs its own packages' kits over itself without declaring a dependency on them purely to make them findable. The workspace matches by the `name` its manifest declares, `private: true` included, and resolution is anchored to the directory whose config named the package, so a `--recursive` sweep reads each project's own workspaces.

Two limitations follow from resolving through `node_modules`, and neither applies to a workspace, because a configured package that `node_modules` does not contain is still resolved through the workspace fallback. A package that is not a workspace must be a **direct** dependency: a strict pnpm layout links nothing else into the project, so a transitive package is genuinely unreachable. And Yarn Plug'n'Play keeps no `node_modules` on disk, so package sources do not resolve under it.

A published version other than the installed one is not yet reachable through `npm:` -- naming one says so. Use `--url` with the published address in the meantime:

```bash
rdy run --url https://unpkg.com/@acme/eslint-config@2.1.0/.readyup/kits/drift.js
```

## ReadyUp's own kits

ReadyUp publishes two kits of its own, about readyup projects themselves. Any project with readyup as a direct dependency can reach them:

```bash
rdy run --from npm:readyup            # default: authoring hygiene, advisory
rdy run --from npm:readyup publishing # publication readiness, blocking
rdy list --from npm:readyup           # both, with the checklists each one has
```

`default` reports at `warn` and below, so it is safe to run mid-edit:

| Checklist   | What it asserts                                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `setup`     | A config file is present (at `recommend`), and a manifest records what has been compiled.                                          |
| `freshness` | Every kit the manifest records still matches what was recorded for it: its source, its bundle, and everything the compile inlined. |

Both `setup` checks stand down for a project that defines no kits of its own: a monorepo root that lists `packages` rather than authoring kits is not expected to keep any at its root, and a project is judged to define kits once it holds either `.readyup/kits` or `.readyup/manifest.json`. The manifest check stands down for a second reason, when nothing is compiled, since a project running its kits with `--jit` has nothing to record. So does `freshness`, which otherwise names one check per recorded kit. Beneath each kit, the comparison over what it inlined stands down for an entry compiled before readyup [recorded its inputs](#what-a-manifest-entry-records); an inlined JSON file is decided by the projection that was substituted rather than by the file holding it, through the same `projectJsonFile` the compile recorded through.

`publishing` reports at `error`, for a package that distributes its kits:

| Checklist          | What it asserts                                                                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packaging`        | `files` ships the kit directory, the manifest is present, a kit named `default` exists (at `warn`), every recorded kit sits in `.readyup/kits` under its own name, and the README fits inside the registry's 65,536-code-point `readme` field. |
| `freshness`        | The comparisons `default` makes, at blocking severity: a stale kit publishes checks that no longer describe the package they travel with.                                                                                                      |
| `self-containment` | Every bundle imports only `node:*`, `readyup`, and `readyup/*` -- the specifiers [`rdy compile`](#compiling) leaves external.                                                                                                                  |

A package declaring no `files` field passes the first check, because everything ships. That check is a containment test rather than an npm-packlist emulation: a `files` list built from globs or negations needs a `.readyup` entry beside them to satisfy it.

Both kits read the convention layout: `.readyup/manifest.json` and bundles directly under `.readyup/kits`. A project that compiles to a different `outDir` still gets its recorded kits checked for freshness, since those paths come from the manifest, but the checks that count compiled bundles report nothing to do. For a published package the layout is not a convention but a contract, which is what the `packaging` check over recorded paths enforces: `--from npm:` composes a kit's path from its name, so a bundle recorded anywhere else is listed and then fails to load.

Adding readyup to `packages` in the config is what makes `rdy run --packages` include readyup's `default` kit. `publishing` is not part of that run, by the rule that holds back every kit not named `default`; reach it with `rdy run --packages publishing`, which runs it from each listed package publishing a kit by that name. Until readyup is listed, `rdy list` names it among the dependencies that publish kits, and `rdy list --packages` shows the kits it holds.

## Internal kits

Internal kits are TypeScript sources a repo runs on itself rather than publishing. The `internal.dir` and `internal.infix` [config keys](authoring-kits.md#config) locate them.

An **infix** is a segment between the kit name and the extension. With `infix: 'internal'`, the kit `deploy` lives at `deploy.internal.ts`; with no infix configured -- the default -- it is simply `deploy.ts`.

```ts
export default defineRdyConfig({
  internal: { dir: 'internal', infix: 'internal' },
});
```

`rdy run --internal <name>` resolves through these settings, and `rdy list` buckets sources under **Internal** and bundles under **Compiled**.

## Verifying

```
── Verifying kits against .readyup/manifest.json
🔴 deploy
   drift (expected 6f58905a, got eb104f57)
   💊 Move the edits into the source, then run `rdy compile --force`.
🟢 smoke

1 of 2 kits failed verification.
```

A failing kit closes with what to do about it, behind the token `rdy run` puts on a check's `fix`. The remedies follow every verdict rather than sitting beside the one that produced each, and a remedy several of a kit's verdicts share is named once. A file more than one axis names is remedied once too, by the axis holding the more exact account of it, and a remedy whose whole action is a bare `rdy compile` is dropped once the bundle has drifted, since the drift gate refuses that command and the `--force` remedy recompiles from the same source. Remedies the force recompile does not settle still print.

Each kit has three independent verdicts. The compiled output is `ok`, `drift`, `missing`, or `unverified`; the source is `ok`, `stale`, `missing`, or `unverified`; the [recorded inputs](#what-a-manifest-entry-records) are `ok`, `stale`, or `unverified`. `drift` means someone edited the bundle by hand; a stale source means the TypeScript moved on and nobody recompiled; stale inputs mean the same of a module the bundle inlined or a JSON projection it substituted. A kit can be all three at once.

The inputs verdict names every input that failed rather than the first, each on its own line, separating a changed module from a changed inline projection. A projected file that is still present while the fields the kit picked are gone is reported as `unprojectable`, which says something about the kit rather than about the file:

```
🔴 deploy
   input stale: checks/shared.ts (module, expected 6f58905a, got eb104f57)
   input unprojectable: ../../package.json (Path not found in JSON: version)
   💊 Run `rdy compile` to rebuild it.
   💊 Restore the picked fields in ../../package.json, or repoint the kit's `pickJson` call.
```

A changed input is recompiled away; an unprojectable one is not, because the file is present and it is the kit that names fields no longer there.

Anything other than `ok` or `unverified` on any axis fails the run. `unverified` does not, since an entry with no recorded hash -- or one compiled before readyup recorded the input closure -- says nothing about whether the kit changed.

Under `--json`, each kit reports `status`, `sourceStatus`, and `inputsStatus`. A `drift` verdict reports `expected` and `actual`; a stale source reports `sourceExpected` and `sourceActual`; stale inputs report `inputFailures`, one entry per input naming its `kind`, `path`, and `reason`, plus whichever of `expected`, `actual`, and `detail` that reason has. The remedies are human output alone: a consumer reads the verdict and words its own.

In CI:

```yaml
- run: npx rdy verify
```

`rdy verify` enforces where `rdy run` advises: a stale source fails verification and exits 1, while a run emits a warning and proceeds. A verification tool that refused to run because its own bookkeeping was out of date would be worse than one that ran and said so.

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

A mismatch names which recorded versions changed, read from what the manifest records: the readyup that compiled the bundle, the esbuild, and each bundled package whose version the rebuild does not reproduce. When every recorded version matches, the mismatch says so, which leaves an edited bundle, a changed input, or dependency content changed without a version bump. The comparison reads the rebuild's own record on both sides, so nothing is resolved from the installed tree, and an entry compiled before the version record renders the bare hashes.

The comparison is against the bundle on disk, never the recorded hash, so the verdict is independent of the manifest's bookkeeping and can contradict it. A bundle that reproduces exactly while its recorded hash does not match says the record is what went wrong, not the kit:

```
🔴 deploy
   drift (expected 6f58905a, got eb104f57)
   rebuild ok
   💊 The bundle reproduces, so its recorded hash is what is stale. Run `rdy compile --force` to re-record it.
```

The remedy changes with it. A drifted bundle is otherwise sent back through the source, since only a hand edit explains it; here there is nothing to move, and `--force` rewrites the record rather than the kit. Either way the command includes `--force`, because `rdy compile` gates on drift and skips the kit rather than overwriting it.

The verdict is `ok`, `mismatch`, `failed` (the source no longer compiles), or `missing` (nothing to recompile, or nothing to compare against). Only `ok` passes. There is no `unverified` here: an exactness check that waived the kits it could not reach would establish less than it appears to.

Under `--json`, each kit adds `rebuildStatus`. A `mismatch` reports `rebuildExpected` and `rebuildActual`, plus `rebuildCompiledWith` when the bundle was built by a different readyup, `rebuildEsbuild` (the recorded esbuild against the rebuild's) whenever the entry records one, and `rebuildDependencyChanges` when at least one bundled package's version moved; a `failed` reports `rebuildError`. Without the flag, none of these fields appears.

Three things to know before wiring it into CI: It requires esbuild, which a repository that compiles kits already has. The readyup version forms part of a bundle's hash, so a readyup upgrade makes every kit mismatch until recompiled; an esbuild or dependency upgrade mismatches wherever it changes a bundle, and the mismatch clause names it. And it must not run after a step that recompiles kits, because recompilation would defeat the comparison.

The directory the command runs in is not one of them. The same source in the same package always compiles to the same bundle, so `rdy verify --rebuild` returns the same verdict from anywhere in the repository.

```yaml
- run: npx rdy verify --rebuild
```
