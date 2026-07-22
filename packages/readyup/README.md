# readyup

Run pre-deployment verification checks against your environment and configuration. Define checklists in TypeScript kits, run them locally or from a remote source, and get clear pass/fail reporting with remediation hints.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add -D readyup
```

Node 24 or later is required, for the runner and for the kits it compiles.

## Quick start

Scaffold a starter config and kit:

```bash
rdy init
```

This creates two files:

**`.config/readyup.config.ts`** — repo-level settings:

```ts
import { defineRdyConfig } from 'readyup';

export default defineRdyConfig({
  compile: {
    srcDir: '.readyup/kits',
    outDir: '.readyup/kits',
  },
});
```

**`.readyup/kits/default.ts`** — starter kit:

```ts
import { defineRdyKit } from 'readyup';

export default defineRdyKit({
  checklists: [
    {
      name: 'deploy',
      checks: [
        {
          name: 'environment variables set',
          check: () => Boolean(process.env['NODE_ENV']),
          fix: 'Set NODE_ENV before deploying',
        },
      ],
    },
  ],
});
```

Run the checks:

```bash
rdy run
```

## CLI reference

```
rdy [names...] [options]
rdy <command> [options]
```

### Commands

| Command          | Description                                      |
| ---------------- | ------------------------------------------------ |
| `run [names...]` | Run checklists (default)                         |
| `compile [file]` | Bundle TypeScript kit(s) into self-contained ESM |
| `init`           | Scaffold a starter config and kit                |
| `list`           | List available kits                              |
| `verify`         | Check compiled kits against manifest hashes      |

### Run options

| Option                        | Description                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| `--from <source>`             | Kit source (see [kit sources](#kit-sources) below)            |
| `--file, -f <path>`           | Path to a local kit file                                      |
| `--url <url>`                 | Fetch kit from a URL                                          |
| `--jit`                       | Run from TypeScript source instead of compiled JS             |
| `--internal`                  | Use internal kit directory and infix from config              |
| `--checklists, -c <name,...>` | Filter checklists within the selected kit                     |
| `--json`                      | Output results as JSON                                        |
| `--detail <summary\|full>`    | How much of the JSON report to emit (default: `full`)         |
| `--fail-on <severity>`        | Fail on this severity or above (`error`, `warn`, `recommend`) |
| `--report-on <severity>`      | Show this severity or above (`error`, `warn`, `recommend`)    |

`--checklists` selects checklists within one kit. Pair it with a single positional kit, with `--file` or `--url`, or with no kit at all to filter the default kit. Naming two or more kits, or naming one that already carries a `:checklist` filter, is an error rather than a merge.

`--report-on` prunes only the reported detail tree, and keeps the parent checks of anything it shows so nesting stays intact. Summary counts, worst severity, and the exit code always reflect the whole run.

### Exit codes

| Code | Meaning                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Ran and found no problems                                                                                                     |
| `1`  | Ran and found problems with the repo or its kits: failed checks, a `verify` drift or missing kit, a kit that fails to compile |
| `2`  | Could not complete the invocation: a usage, config, kit-load, or internal error                                               |

The distinction is between "fix the repo" (`1`) and "fix the invocation" (`2`), so a pipeline can branch on which is which. `rdy list` and `rdy init` produce only `0` and `2` — neither can find problems to report.

A run that loses a kit part-way exits `2` even when the kits that ran also found problems, since part of the invocation did not complete. It still reports what it collected.

### JSON output

`run`, `compile`, `list`, and `verify` all accept `--json`. `init` does not: scaffolding is interactive and stays human-only.

With `--json`, stdout carries exactly one JSON document and every human-readable line — headers, progress, warnings, errors — goes to stderr. The exceptions are `--help` and `--version`, which have no JSON form: their text goes to stderr and stdout stays empty.

#### Published schemas

Each payload is specified by a JSON Schema shipped with the package, and carries an integer `schemaVersion` matching the `vN` in its schema's filename.

| Payload        | Import path                              | `$id`                                                      |
| -------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `compile`      | `readyup/schemas/compile.v1.json`        | `https://unpkg.com/readyup/schemas/compile.v1.json`        |
| error envelope | `readyup/schemas/error-envelope.v1.json` | `https://unpkg.com/readyup/schemas/error-envelope.v1.json` |
| `list`         | `readyup/schemas/list.v1.json`           | `https://unpkg.com/readyup/schemas/list.v1.json`           |
| `run` report   | `readyup/schemas/report.v1.json`         | `https://unpkg.com/readyup/schemas/report.v1.json`         |
| `verify`       | `readyup/schemas/verify.v1.json`         | `https://unpkg.com/readyup/schemas/verify.v1.json`         |

The schemas are generated from the same definitions the exported `Json*` TypeScript types are derived from, so the published contract and the types cannot drift apart.

#### Evolution policy

The five payloads version independently: reshaping the report leaves a consumer pinned to `list.v1.json` untouched.

- **Adding an optional field does not bump `schemaVersion`.** The schemas do not constrain properties they have not heard of, so a validator pinned to `v1` keeps accepting payloads from a later readyup that added one.
- **Removing, renaming, or re-typing a field does bump it**, and publishes a new `vN` file beside the old one. Widening a closed set of values — an error `code`, a check `status` — counts as re-typing.
- **A field is `required` only when every payload carries it.** Omission is reserved for genuinely absent or empty data, so a present field never means "nothing here".

#### Error envelope

An invocation that fails before it can produce anything else emits the envelope:

```json
{ "schemaVersion": 1, "error": { "code": "usage", "message": "Unknown option '--bogus'" } }
```

`code` is one of `usage`, `config`, `kit-load`, or `internal`. The exit code does not determine which document appears.

The envelope covers only failures that precede dispatch. Once the run reaches its kits, a kit that fails is reported inside the report instead of replacing it, so each entry in `kits` takes one of two shapes, told apart by whether `error` is present:

```json
{ "name": "release", "error": { "code": "kit-load", "message": "Cannot find .readyup/kits/release.js" } }
```

An error entry carries no counts and no verdict, because a kit that never ran has neither to report; the top-level totals cover only the kits that ran. In human mode the same failure goes to stderr, which keeps it distinct from a failed check. A run of more than one kit prefixes the kit's name, as `Error [release]: ...`.

#### The run report

```json
{
  "schemaVersion": 1,
  "readyupVersion": "0.21.2",
  "passed": false,
  "counts": { "passed": 4, "errors": 1, "warnings": 0, "recommendations": 0, "blocked": 2, "optional": 1 },
  "worstSeverity": "error",
  "failOn": "error",
  "reportOn": "recommend",
  "detail": "full",
  "durationMs": 68,
  "kits": [{ "name": "deploy", "passed": false, "counts": {}, "durationMs": 68, "checklists": [] }]
}
```

- **`passed`** is the run verdict: true when every requested kit produced results and no result at or above `failOn` failed, so it agrees with exit code 0 in every case. Kit and checklist entries carry their own `passed`, which means the narrower "nothing here failed".
- **`counts`** holds the six result tallies at the report, kit, and checklist levels. They nest rather than sitting flat so the count names and the verdict names share no namespace, which is what makes the additive-evolution rule above sound rather than merely conventional.
- **`worstSeverity`** sits beside `counts` — it is derived verdict data, not a count — and is omitted when nothing failed.
- **`failOn`**, **`reportOn`**, and **`detail`** echo the settings the run resolved, so a consumer holding only the payload can tell a clean run from one whose failures were filtered out of view. A kit that declares its own `failOn` overrides the run-level value for its own checks.
- **`warnings`** carries any advisory the run raised, as `{ code, message, remedy? }`. Warnings keep their stderr line in both modes; under `--json` they are captured here as well, because a consumer that owns only stdout would otherwise never see them. The field is absent when the run raised none.

Payloads are slim by construction: a field carrying nothing is omitted rather than emitted as `null`, empty `checks` arrays are dropped, durations are whole milliseconds, and `fix` appears only on checks that failed.

#### Choosing how much detail to receive

`--detail summary` keeps the counts, verdicts, and worst severity but reduces the detail tree to the checks that failed and the fixes they carry — the shape an agent needs to decide what to do next, at a fraction of the tokens. `--detail full` is the default and keeps every reported check.

```bash
rdy run --json --detail summary
```

Both projections are described by `report.v1.json`, so a consumer validates one document either way and reads the report's own `detail` field to learn which projection it received. Passing `--detail` without `--json`, or to any command other than `run`, is a usage error rather than a silently ignored flag.

### Kit sources

The `--from` flag accepts these source types:

| Source     | Format                    | Example                                                 |
| ---------- | ------------------------- | ------------------------------------------------------- |
| Bitbucket  | `bitbucket:ws/repo[@ref]` | `--from bitbucket:team/ops`                             |
| GitHub     | `github:org/repo[@ref]`   | `--from github:acme/ops` or `--from github:acme/ops@v2` |
| Local repo | `<path>`                  | `--from .` or `--from ../other-repo`                    |
| Global     | `global`                  | `--from global`                                         |
| Directory  | `dir:<path>`              | `--from dir:/shared/kits`                               |

`@ref` defaults to `main` when omitted. Local repo paths look for kits in `<path>/.readyup/kits/`, while `dir:` paths are used directly.

### Authentication for remote sources

Private repositories are accessed via tokens resolved from ambient sources:

- **GitHub** (`--from github:`): reads `GITHUB_TOKEN`; falls back to `gh auth token` when the env var is unset.
- **Bitbucket** (`--from bitbucket:`): reads `BITBUCKET_TOKEN`.

When no token is available, requests go anonymous and only public repositories will succeed.

### List

```
rdy list                       List internal and compiled kits (owner view)
rdy list --from <path>         List compiled kits at a local path
rdy list --from global         List compiled kits in the global directory
rdy list --from dir:<path>     List kits in an arbitrary directory
rdy list --from github:org/repo[@ref]      List kits from a GitHub manifest
rdy list --from bitbucket:ws/repo[@ref]    List kits from a Bitbucket manifest
rdy list --manifest <path>     List the kits a manifest file declares
```

A local `--from` source with no manifest beside its kits falls back to listing the compiled kits on disk, which are the same kits `rdy run --from` would resolve. Those rows carry a name and a path only; descriptions, checklist names, and versions live in the manifest that is absent. A remote source still requires one.

Under `--json`, each row reports `name`, `kind` (`internal` for a TypeScript source, `compiled` for a bundle), `path`, and — for kits a manifest describes — `checklists`, `description`, and `readyupVersion`. Checklist names are read from the manifest, so listing kits never imports a compiled bundle and never runs kit code.

### Compile

```
rdy compile                    Compile every source in the config's srcDir
rdy compile <file>             Compile a single file
```

A sweep runs to completion: a kit that fails to compile is reported and the next kit is tried, so one broken kit cannot hide the state of the kits that sort after it. A kit that failed is left out of the manifest rather than recorded as though it had compiled, and the run exits 1.

`rdy compile` refuses to overwrite a compiled kit whose on-disk hash differs from the manifest's recorded `targetHash` — someone edited the compiled file directly. Drifted kits are reported and skipped; `--force` overwrites them anyway.

Each kit's checklist names are recorded in the manifest so `rdy list` can report them without running the kit. The field is optional and absent from manifests written by earlier versions, so the manifest format stays at version 1.

Under `--json`, each kit reports `name`, `status` (`compiled`, `skipped`, or `failed`), and the reason it was skipped or failed.

### Verify

```
rdy verify                     Check compiled kits against the manifest's hashes
```

Each kit is reported as `ok`, `drift`, `missing`, or `unverified`. Drift and missing fail the run; `unverified` — a manifest entry with no recorded hash — does not, since it says nothing about whether the kit has changed. Under `--json`, a `drift` entry carries the `expected` and `actual` hashes alongside an overall verdict.

## Authoring API

All helpers are type-safe identity functions that provide editor autocomplete without runtime overhead. Import them from `readyup`.

| Helper                     | Description                          |
| -------------------------- | ------------------------------------ |
| `defineRdyConfig`          | Repo-level config                    |
| `defineRdyKit`             | Kit (collection of checklists)       |
| `defineRdyChecklist`       | Flat checklist                       |
| `defineRdyStagedChecklist` | Staged checklist (sequential groups) |
| `defineChecklists`         | Array of checklists                  |

## Check utilities

Reusable check functions for common assertions:

```ts
import { fileExists, fileContains, hasPackageJsonField } from 'readyup/check-utils';
```

| Function                                    | Description                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `fileExists(path)`                          | File exists at path                                                     |
| `fileContains(path, pattern)`               | File matches a string or regex                                          |
| `fileDoesNotContain(path, pattern)`         | File does not match                                                     |
| `readFile(path)`                            | Read file contents (returns `undefined` if missing)                     |
| `hasPackageJsonField(field, value?)`        | package.json has a field (optionally matching a value)                  |
| `hasDevDependency(name)`                    | package.json has a dev dependency                                       |
| `hasMinDevDependencyVersion(name, version)` | Dev dependency meets minimum version                                    |
| `readPackageJson()`                         | Parse package.json                                                      |
| `discoverWorkspaces(options?)`              | Enumerate monorepo workspaces (single-workspace repos return one entry) |
| `compareVersions(a, b)`                     | Compare semver strings                                                  |
| `readTsconfigLanguageLevel(path)`           | Effective `lib` and `target` of a tsconfig, resolved through `extends`  |
| `readEnginesNodeFloor(manifest)`            | Minimum Node version a parsed manifest declares in `engines.node`       |
| `satisfiesNodeFloor(version, floor)`        | Runtime is at or above a floor (`undefined` if either is uncomparable)  |
| `readToolVersionsNode(path?)`               | Node version declared in `.tool-versions`                               |
| `esYearForNodeMajor(major)`                 | ECMAScript year a Node major supports (`24` → `es2025`)                 |
| `runGit(path, ...args)`                     | Run a git command and return trimmed stdout                             |
| `expandHome(path)`                          | Expand leading `~` or `~/` to the home directory                        |
| `isAtRepoRoot(path)`                        | Path is the top of a git working tree                                   |
| `isGitRepo(path)`                           | Path is inside a git working tree                                       |
| `compareLocalRefs(path, refA, refB)`        | Compare two local refs (discriminated-union result)                     |
| `compareRefToRemote(path, ref, remote?)`    | Compare a local ref to its remote counterpart                           |
| `makeLocalRefSyncCheck(options)`            | Check factory: verify two local refs match                              |
| `makeRemoteRefSyncCheck(options)`           | Check factory: verify a ref matches its remote counterpart              |

### Discovering workspaces

`discoverWorkspaces()` returns a uniform `Workspace[]` that collapses pnpm, npm, and yarn monorepo conventions — and single-workspace repos — into one iteration shape. Every entry includes `dir` (relative to `cwd`; `'.'` for a single-workspace repo), `absolutePath`, `name`, `isPackage` (true when `package.json.private !== true`), and the parsed `packageJson`.

Common filter pattern — get all publishable workspaces:

```ts
import { discoverWorkspaces } from 'readyup/check-utils';

const packages = discoverWorkspaces({ filter: (w) => w.isPackage });
```

Note: `pnpm-workspace.yaml` is read by a minimal block-sequence parser; configs using YAML anchors, flow sequences, negation patterns, or other non-trivial features will raise a clear error with a pointer to file an issue.

### Reading runtime alignment

`readTsconfigLanguageLevel(path)` reports what language level a tsconfig actually declares, which may be several `extends` hops away. Alongside `lib` and `target` — lowercased, so comparisons are string equality — it returns `chain`, the configs it read with the entry file first, and `unresolvedExtends`, the references it could not follow. Bare package specifiers such as `@tsconfig/node24/tsconfig.json` are never followed, and a missing or unparseable parent ends that branch of the walk; both land in `unresolvedExtends`, so a check can tell an incomplete answer from a genuinely undeclared setting. A missing or unparseable entry file returns `undefined`. Configs are read as JSONC, so comments and trailing commas are fine.

`readEnginesNodeFloor(manifest)` recognizes only the range forms from which a single floor follows: `>=24`, `^22.1`, and a bare `24.1.0`. Anything else — a union such as `^20 || ^22`, a hyphen range, a wildcard — comes back as `{ kind: 'unparseable' }` rather than an invented floor. It takes an already-parsed manifest, so it composes with `discoverWorkspaces` without re-reading files.

`satisfiesNodeFloor(version, floor)` compares two dotted numeric versions and returns `undefined` for anything else. That matters because `readToolVersionsNode` reports whatever the file names, and `lts`, `latest`, `system`, and `ref:<git ref>` are all valid pins: without the `undefined`, an unreadable pin would be indistinguishable from a runtime that genuinely sits below the floor.

Each reader answers only what it can see, so a check composing them decides for itself what each unknown means. Collapsing them into a single boolean is what lets real drift pass unreported:

```ts
import {
  discoverWorkspaces,
  readEnginesNodeFloor,
  readToolVersionsNode,
  satisfiesNodeFloor,
} from 'readyup/check-utils';

const runtime = readToolVersionsNode();

const findings = discoverWorkspaces().flatMap(({ dir, packageJson }) => {
  const declared = readEnginesNodeFloor(packageJson);
  if (declared.kind === 'absent') return [`${dir}: declares no engines.node`];
  if (declared.kind === 'unparseable') return [`${dir}: engines.node "${declared.raw}" names no single floor`];

  const meetsFloor = runtime === undefined ? undefined : satisfiesNodeFloor(runtime, declared.floor);
  if (meetsFloor === undefined) return [`${dir}: floor ${declared.floor} has no comparable runtime`];
  return meetsFloor ? [] : [`${dir}: runtime ${runtime} is below its ${declared.floor} floor`];
});
```

## Compatibility

`readyup/check-utils` is the stable, versioned surface for kit-author imports of check utilities. It follows semver: no breaking changes within a major version.

Compiled kits embed nothing of readyup itself — the runner satisfies `readyup` and `readyup/*` imports at runtime via its module-resolution hook. Kits are therefore version-coupled to the runner across breaking boundaries: when you upgrade readyup across a major, recompile your kits with `rdy compile` so any newly-shipped or changed check utilities are picked up.

## License

MIT
