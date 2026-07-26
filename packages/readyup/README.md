# readyup

Run pre-deployment verification checks against your environment and configuration. Define checklists in TypeScript kits, run them locally or from a remote source, and get clear pass/fail reporting with remediation hints.

<!-- section:release-notes --><!-- /section:release-notes -->

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Concepts](#concepts)
- [Authoring kits](#authoring-kits)
- [Running checks](#running-checks)
- [JSON output](#json-output)
- [Publishing kits](#publishing-kits)
- [Check utilities](#check-utilities)
- [Compatibility](#compatibility)
- [License](#license)

## Installation

```bash
pnpm add --save-dev readyup
```

Node 24 or later is required, for the runner and for the kits it compiles.

## Quick start

```bash
rdy init
```

This creates two files:

**`.config/readyup.config.ts`** -- repo-level settings:

```ts
import { defineRdyConfig } from 'readyup';

export default defineRdyConfig({
  compile: {
    srcDir: '.readyup/kits',
    outDir: '.readyup/kits',
  },
});
```

**`.readyup/kits/default.ts`** -- starter kit:

```ts
import { defineRdyKit } from 'readyup';

export default defineRdyKit({
  checklists: [
    {
      name: 'deploy',
      checks: [
        {
          name: 'NODE_ENV is set',
          check: () => Boolean(process.env['NODE_ENV']),
          fix: 'Set NODE_ENV before deploying',
        },
      ],
    },
  ],
});
```

Compile the kit, then run it:

```bash
rdy compile
rdy run
```

With `NODE_ENV` unset:

```
🔴 NODE_ENV is set

🔴 1 error (0ms)

── Fixes

💊 NODE_ENV is set
   Set NODE_ENV before deploying
```

`rdy run --jit` skips compilation and runs the TypeScript source directly, which is the faster loop while writing checks. Compiled kits stay the vetted artifact: they are what `rdy verify` hashes and what a consumer running `rdy run --from` gets.

## Concepts

### Kits, checklists, and checks

A **kit** is a file exporting one or more **checklists**. A checklist holds **checks**, and a check may nest further checks beneath it. A check that fails blocks its descendants.

```
kit
└── checklist
    └── check
        └── check
```

### Severities

Every check carries a severity. It decides whether a failure fails the run and whether the result is reported, and it never decides whether that check itself runs. It reaches later work in one place only: a failed check at or above the failure threshold stops the remaining groups of a [staged checklist](#staged-checklists).

| Severity    | Meaning           |
| ----------- | ----------------- |
| `error`     | Must be fixed     |
| `warn`      | Should be fixed   |
| `recommend` | Worth considering |

### Statuses

A check result has one of three statuses -- `passed`, `failed`, or `skipped`. The token shown in output is derived by crossing status with severity (for failures) or with the skip reason (for skips), which is why an author returns a boolean and declares severity separately rather than choosing a token.

| Rich | Plain   | Status    | Derived from                                 |
| ---- | ------- | --------- | -------------------------------------------- |
| 🟢   | `PASS`  | `passed`  | --                                           |
| 🔴   | `FAIL`  | `failed`  | severity `error`                             |
| 🟠   | `WARN`  | `failed`  | severity `warn`                              |
| 🟡   | `RECO`  | `failed`  | severity `recommend`                         |
| ⚪   | `SKIP`  | `skipped` | `skip` returned a reason; counts as optional |
| 🚫   | `BLOCK` | `skipped` | a precondition failed; counts as blocked     |

💊 `FIX` marks a remediation hint rather than a result. 📄 and 📦 are nouns, not statuses: a TypeScript source and a compiled bundle.

### Thresholds

Two thresholds govern a run, each resolved as **CLI flag, then the kit's own field, then the default**.

| Threshold | Field / flag               | Default     | Governs                                |
| --------- | -------------------------- | ----------- | -------------------------------------- |
| Failure   | `failOn` / `--fail-on`     | `error`     | Whether a failure fails the run        |
| Reporting | `reportOn` / `--report-on` | `recommend` | Whether a result appears in the output |

A check with no `severity` takes the kit's `defaultSeverity`, which itself defaults to `error`.

Reporting prunes the detail tree only. Summary counts, worst severity, and the exit code always reflect the whole run.

## Authoring kits

All helpers are type-safe identity functions that provide editor autocomplete without runtime overhead. Import them from `readyup`.

| Helper                     | Defines             |
| -------------------------- | ------------------- |
| `defineRdyConfig`          | Repo-level config   |
| `defineRdyKit`             | Kit                 |
| `defineRdyChecklist`       | Flat checklist      |
| `defineRdyStagedChecklist` | Staged checklist    |
| `defineChecklists`         | Array of checklists |

### Config

Repo-level settings live in `.config/readyup.config.ts`.

| Key               | Default         | Meaning                                                       |
| ----------------- | --------------- | ------------------------------------------------------------- |
| `compile.srcDir`  | `.readyup/kits` | Directory `rdy compile` reads sources from                    |
| `compile.outDir`  | `.readyup/kits` | Directory it writes bundles to                                |
| `compile.include` | all `.ts` files | Glob limiting which sources a sweep compiles                  |
| `internal.dir`    | `.`             | Directory holding internal sources, relative to the kits root |
| `internal.infix`  | none            | Filename segment marking a file as internal                   |

See [internal kits](#internal-kits) for what the `internal` keys select.

### Kit

| Field             | Type                         | Default     | Meaning                                    |
| ----------------- | ---------------------------- | ----------- | ------------------------------------------ |
| `checklists`      | `Array<Checklist \| Staged>` | required    | The checklists this kit runs               |
| `description`     | `string`                     | --          | Summary, reported by `rdy list --manifest` |
| `suites`          | `Record<string, string[]>`   | --          | Named subsets of checklists                |
| `defaultSeverity` | `Severity`                   | `error`     | Severity for checks that declare none      |
| `failOn`          | `Severity`                   | `error`     | Failure threshold                          |
| `reportOn`        | `Severity`                   | `recommend` | Reporting threshold                        |
| `fixLocation`     | `'inline' \| 'end'`          | `end`       | Where fixes render                         |

### Checklists

| Field           | Type                | Default            | Meaning                                     |
| --------------- | ------------------- | ------------------ | ------------------------------------------- |
| `name`          | `string`            | required           | Display name                                |
| `checks`        | `RdyCheck[]`        | required if flat   | Checks, run concurrently (flat checklist)   |
| `groups`        | `RdyCheck[][]`      | required if staged | Groups, run sequentially (staged checklist) |
| `preconditions` | `RdyCheck[]`        | --                 | Gating checks                               |
| `fixLocation`   | `'inline' \| 'end'` | the kit's setting  | Overrides the kit's setting                 |

A checklist carries either `checks` or `groups`, never both.

### Checks

| Field      | Type                            | Default                     | Meaning                                    |
| ---------- | ------------------------------- | --------------------------- | ------------------------------------------ |
| `name`     | `string`                        | required                    | The claim being asserted                   |
| `check`    | `() => boolean \| CheckOutcome` | required                    | The assertion; may be async                |
| `severity` | `Severity`                      | the kit's `defaultSeverity` | Overrides the kit's `defaultSeverity`      |
| `skip`     | `() => false \| string`         | --                          | Reason string to skip; `false` to run      |
| `fix`      | `string`                        | --                          | Remediation, shown when the check fails    |
| `checks`   | `RdyCheck[]`                    | --                          | Nested checks, run only if this one passes |

A check returns a boolean or a `CheckOutcome`:

| Field      | Type       | Meaning                                                                      |
| ---------- | ---------- | ---------------------------------------------------------------------------- |
| `ok`       | `boolean`  | Whether the assertion holds                                                  |
| `detail`   | `string`   | Why this status                                                              |
| `progress` | `Progress` | `{ type: 'fraction', passedCount, count }` or `{ type: 'percent', percent }` |

### Naming checks

Three fields, three questions:

> **`name` states what must be true. `detail` answers why this status. `fix` says what to do about it.**

A name is a claim that reads true on a pass and false on a fail. `🔴 Node >= 24` fails that test: the operator leaves the reader to infer which direction is the violation.

| Poor                    | Better                     | Why                                                 |
| ----------------------- | -------------------------- | --------------------------------------------------- |
| `Node >= 24`            | `Node 24 or later`         | words fix the direction without moving the boundary |
| `outdated dependencies` | `dependencies are current` | a name true on _failure_ inverts the status token   |
| `check git status`      | `working tree is clean`    | names the action, not the condition                 |
| `env vars`              | `NODE_ENV is set`          | names the subject, not the claim                    |

Rewriting a name often exposes an ambiguous predicate: an author writing "newer than 24" frequently discovers they meant a floor of 24.

### The detail contract

`detail` answers "why this status" -- not "what this check asserts", which the name already says. On a pass it reports the evidence; on a skip, why the check did not apply; on a failure, what went wrong.

| Status  | Where `detail` renders                                  |
| ------- | ------------------------------------------------------- |
| passed  | inline, after the separator                             |
| skipped | inline, after the separator                             |
| failed  | in a block beneath the claim, above any thrown `Error:` |

Remediation is not detail. It belongs in `fix`.

This kit exercises all three placements at three levels of nesting:

```ts
import { defineRdyKit } from 'readyup';

export default defineRdyKit({
  checklists: [
    {
      name: 'release',
      checks: [
        {
          name: 'working tree is clean',
          check: () => ({ ok: true, detail: 'no uncommitted changes' }),
        },
        {
          name: 'dependencies are installed',
          check: () => true,
          checks: [
            {
              name: 'lockfile is current',
              check: () => ({ ok: true, progress: { type: 'fraction', passedCount: 4, count: 4 } }),
              checks: [
                {
                  name: 'no duplicated majors',
                  check: () => ({ ok: false, detail: 'react resolves to both 18.3.1 and 19.0.0' }),
                  fix: 'Run `pnpm dedupe`, then commit the lockfile',
                },
              ],
            },
            {
              name: 'native modules are rebuilt',
              check: () => true,
              skip: () => 'no native dependencies in this workspace',
            },
          ],
        },
      ],
    },
  ],
});
```

It produces:

```
🟢 working tree is clean · no uncommitted changes
🟢 dependencies are installed
   🟢 lockfile is current [4 of 4]
      🔴 no duplicated majors
         react resolves to both 18.3.1 and 19.0.0
   ⚪ native modules are rebuilt · no native dependencies in this workspace

🔴 3 passed | 1 error | 1 skipped (0ms)

── Fixes

💊 no duplicated majors
   Run `pnpm dedupe`, then commit the lockfile
```

A failing descendant turns the tail line red while every ancestor stays green. `progress` needs no `detail`: `[4 of 4]` is already the evidence.

### Staged checklists

A staged checklist replaces `checks` with `groups`. Groups run in order; checks within a group run concurrently.

```ts
import { defineRdyStagedChecklist } from 'readyup';

export default defineRdyStagedChecklist({
  name: 'release',
  groups: [[{ name: 'working tree is clean', check: () => true }], [{ name: 'tests pass', check: () => true }]],
});
```

A failure at or above the [failure threshold](#thresholds) stops the groups after it; a below-threshold failure is reported and the next group still runs. Only top-level results gate: a failing _nested_ check does not halt the next group.

This is the one gate that consults the threshold. A failed check blocks its own descendants, and a failed precondition gates its checklist, whatever the severity.

### Preconditions

A checklist's `preconditions` gate the checks that follow. If any precondition fails, every check is skipped and each records `precondition` as its reason.

- **A failed precondition gates regardless of severity.** Severity decides whether the run fails; the gate decides whether the checks are worth running. Unlike a staged checklist's groups, the gate does not consult the [failure threshold](#thresholds).
- **A precondition skipped `n/a` does not gate.** To make a whole checklist inapplicable, nest its checks under one parent check whose `skip` returns a reason.

### Suites

`suites` names reusable subsets of checklists. A suite name is accepted anywhere a checklist name is, and expands in the order the suite declares.

```ts
export default defineRdyKit({
  suites: { fast: ['lint', 'types'] },
  checklists: [/* lint, types, integration */],
});
```

```bash
rdy deploy:fast
```

### Validation

Neither `rdy compile` nor `rdy run --jit` type-checks the kit it loads, so both validate structure at load time, identically -- `rdy compile` refuses to publish a kit that `rdy run` would reject.

Every check is validated wherever it appears: in `checks`, in `groups`, in `preconditions`, and nested. A check needs a non-empty `name` and a `check` function; `severity` must be a valid value; `skip` must be a function and `fix` a string when present. Unknown keys are allowed, so a kit written for a later readyup still loads.

```
Invalid kit at .readyup/kits/default.js:
  checklists[0].checks[1].severity: expected one of "error", "warn", "recommend", got "info"
  checklists[0].checks[2].check: expected a function, got string
```

A typo'd `severity` is the mistake this matters most for: an unrecognized value would otherwise exclude the check from both thresholds, and the run would pass.

## Running checks

```
rdy [kit[:checklist,...] ...] [options]
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

### Selecting what runs

A positional argument names a kit, optionally with checklists or suites after a colon:

```bash
rdy deploy                 # every checklist in the deploy kit
rdy deploy:build,test      # two checklists from it
rdy deploy:fast            # a suite
rdy deploy release         # two kits
```

`--checklists` filters within a single kit, and pairs with one positional kit, with `--file` or `--url`, or with no kit at all. Naming two kits, or one that already carries a `:checklist` filter, is an error rather than a merge.

Kit names may contain `/`, as in `shared/deploy`. To name one that starts with `-`, place it last, after `--`:

```bash
rdy run -- "--odd-kit-name"
```

### Run options

| Option                        | Description                                           |
| ----------------------------- | ----------------------------------------------------- |
| `--from <source>`             | Kit source (see [kit sources](#kit-sources))          |
| `--file, -f <path>`           | Path to a local kit file                              |
| `--url <url>`                 | Fetch kit from a URL                                  |
| `--jit`                       | Run from TypeScript source instead of compiled JS     |
| `--internal`                  | Use the internal kit directory and infix from config  |
| `--checklists, -c <name,...>` | Filter checklists within the selected kit             |
| `--json`                      | Output results as JSON                                |
| `--detail <summary\|full>`    | How much of the JSON report to emit (default: `full`) |
| `--fail-on <severity>`        | Fail on this severity or above                        |
| `--report-on <severity>`      | Show this severity or above                           |
| `--quiet`                     | Hide passed checks; incompatible with `--json`        |

`--quiet` filters by status where `--report-on` filters by severity, so the two compose rather than override. Both keep the parent checks of anything they show, so a failure nested under passing parents stays reachable.

### Global options

| Option                        | Description                    |
| ----------------------------- | ------------------------------ |
| `--style <auto\|plain\|rich>` | Output style (default: `auto`) |
| `--help, -h`                  | Show help for the command      |
| `--version, -V`               | Show the version number        |

### Kit sources

| Source     | Format                    | Example                     |
| ---------- | ------------------------- | --------------------------- |
| GitHub     | `github:org/repo[@ref]`   | `--from github:acme/ops@v2` |
| Bitbucket  | `bitbucket:ws/repo[@ref]` | `--from bitbucket:team/ops` |
| Local repo | `<path>`                  | `--from ../other-repo`      |
| Directory  | `dir:<path>`              | `--from dir:/shared/kits`   |
| Global     | `global`                  | `--from global`             |

`@ref` defaults to `main`. Local repo paths look for kits in `<path>/.readyup/kits/`; `dir:` paths are used directly.

Private repositories use ambient tokens: `GITHUB_TOKEN` (falling back to `gh auth token`) and `BITBUCKET_TOKEN`. Without a token, requests go anonymous and only public repositories succeed.

### Reading the output

A check line reads `token name <separator> detail [progress] (duration)`. The separator is `·` in `rich` and `-` in `plain`; progress takes brackets. Durations appear from 100 ms up, never on a check that did not run, and always on a tail or total line.

**A failed line carries only its claim.** The reason renders beneath it, indented to the name column -- the authored `detail` first, then any thrown exception behind its `Error:` label. Passes and skips keep their detail inline.

Tail and total lines lead with the run's worst severity, then report counts in a fixed order -- passed, errors, warnings, recommendations, blocked, skipped -- omitting any that is zero.

Headings encode level by rule weight: `━━` for a kit, `──` for a checklist, step, or summary. More than one checklist adds a summary table:

```
── build

🟢 types check cleanly (343ms)
🟢 bundle is within budget · 42kB of a 50kB budget [84%]

🟢 2 passed (343ms)

── integration

🟢 database is reachable
🔴 migrations are applied (151ms)
   2 migrations pending: add_users, add_index
⚪ seed data is loaded · seeding is disabled outside CI

🔴 1 passed | 1 error | 1 skipped (151ms)

── Fixes

💊 migrations are applied
   Run `pnpm migrate` against the target database

── Summary

─────────────────────────────────────────────────────
🟢 build        343ms  2 passed
🔴 integration  151ms  1 passed | 1 error | 1 skipped
─────────────────────────────────────────────────────
🔴 Total: 3 passed | 1 error | 1 skipped (494ms)
```

### Output styles

`--style` selects rendering; `RDY_STYLE` carries a standing preference. The flag outranks the environment variable, which outranks detection.

| Value   | Renders                                                                       |
| ------- | ----------------------------------------------------------------------------- |
| `auto`  | `plain` under CI or when output is not a terminal, `rich` otherwise (default) |
| `plain` | Fixed-width ASCII words                                                       |
| `rich`  | Emoji tokens                                                                  |

`CI` catches a runner that attaches a pseudo-terminal; the terminal check catches an interactive `rdy | grep FAIL`. An explicit `CI=false` is read as a denial. Naming a style that does not exist fails the invocation.

In `plain`, every character is printable ASCII, heading rules and separators included, and the noun glyphs are omitted while keeping their column so names stay aligned:

```
-- integration

PASS  database is reachable
FAIL  migrations are applied (151ms)
      2 migrations pending: add_users, add_index
SKIP  seed data is loaded - seeding is disabled outside CI

FAIL  1 passed | 1 error | 1 skipped (151ms)
```

Once a style is named explicitly, output is byte-identical to a terminal or a pipe. `--style` is independent of `--json`: the JSON document never changes.

### Advisory warnings

`rdy run` compares the kits it is about to run against `.readyup/manifest.json` and says so when they disagree. Warnings go to stderr in both modes and appear under `warnings` in JSON; none affects the exit code.

| Code           | Raised when                                                                |
| -------------- | -------------------------------------------------------------------------- |
| `source-stale` | The kit's TypeScript changed since the compiled bundle was built from it   |
| `target-drift` | The compiled bundle no longer matches the manifest's recorded hash         |
| `version-skew` | The kit was compiled against a readyup version differing from the runner's |

They are silent when the manifest is absent, when no entry describes the kit, when an entry records no hashes, or when a file cannot be read. Only the local manifest is consulted, so a kit reached through `--from` is out of scope -- run `rdy verify` in that root instead. They also do not apply to `--url` or `--jit`.

### Exit codes

| Code | Meaning                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------- |
| `0`  | Ran and found no problems                                                                           |
| `1`  | Ran and found problems: failed checks, a `verify` drift or missing kit, a kit that fails to compile |
| `2`  | Could not complete the invocation: a usage, config, kit-load, or internal error                     |

The distinction is "fix the repo" (`1`) versus "fix the invocation" (`2`). `rdy list` and `rdy init` produce only `0` and `2`. A run that loses a kit part-way exits `2` even when the kits that ran found problems, and still reports what it collected.

### Listing kits

```
rdy list                       List internal and compiled kits (owner view)
rdy list --from <source>       List compiled kits at a local path or remote source
rdy list --manifest <path>     List the kits a manifest file declares
```

Each section names the command that runs the kits beneath it:

```
── Internal
   rdy run --jit <name>

📄 deploy
📄 smoke

── Compiled
   rdy run <name>

📦 deploy
📦 smoke
```

`--manifest` reports each kit's compile-time readyup version and description:

```
── Manifest: .readyup/manifest.json

📦 deploy (readyup v0.22.0) · Pre-deployment checks
📦 smoke (readyup v0.22.0)
```

A local `--from` source with no manifest falls back to listing the compiled kits on disk; those rows carry a name and path only. A remote source still requires a manifest.

Rows are keyed by `name` **and** `kind` together. Under the default configuration a compiled source appears twice -- once as `internal` and once as `compiled` -- so a consumer indexing on `name` alone silently drops one.

### Scaffolding

```
rdy init                       Scaffold a starter config and kit
```

| Option          | Description                           |
| --------------- | ------------------------------------- |
| `--dry-run, -n` | Preview changes without writing files |
| `--force`       | Overwrite existing files              |

## JSON output

`run`, `compile`, `list`, and `verify` accept `--json`; `init` does not. With `--json`, stdout carries exactly one JSON document and every human-readable line goes to stderr. `--help` and `--version` have no JSON form.

### Published schemas

Each payload is specified by a JSON Schema shipped with the package and carries an integer `schemaVersion` matching the `vN` in its filename.

| Payload        | Import path                              |
| -------------- | ---------------------------------------- |
| `compile`      | `readyup/schemas/compile.v1.json`        |
| error envelope | `readyup/schemas/error-envelope.v1.json` |
| `list`         | `readyup/schemas/list.v1.json`           |
| `run` report   | `readyup/schemas/report.v1.json`         |
| `verify`       | `readyup/schemas/verify.v1.json`         |

Each `$id` is the same path under `https://unpkg.com/readyup/`. The schemas are generated from the definitions the exported `Json*` types derive from, so the published contract and the types cannot drift apart.

### Evolution policy

The five payloads version independently.

- **Adding an optional field does not bump `schemaVersion`.** A validator pinned to `v1` keeps accepting payloads from a later readyup.
- **Removing, renaming, or re-typing a field does bump it**, publishing a new `vN` beside the old. Widening a closed set counts as re-typing.
- **A field is `required` only when every payload carries it.** Omission is reserved for absent or empty data.
- **`warnings[].code` is an open set**, exempt from the widening rule. Consumers must tolerate an unknown code, displaying its `message` and `remedy`. `error.code` stays closed.

### Error envelope

An invocation that fails before producing anything else emits:

```json
{ "schemaVersion": 1, "error": { "code": "usage", "message": "Unknown option '--bogus'" } }
```

`code` is one of `usage`, `config`, `kit-load`, or `internal`. The envelope covers only failures preceding dispatch; once the run reaches its kits, a failing kit is reported inside the report:

```json
{ "name": "release", "error": { "code": "kit-load", "message": "Cannot find .readyup/kits/release.js" } }
```

An error entry carries no counts and no verdict, and the top-level totals cover only the kits that ran.

### The run report

```json
{
  "schemaVersion": 1,
  "readyupVersion": "0.22.0",
  "passed": false,
  "counts": { "passed": 4, "errors": 1, "warnings": 0, "recommendations": 0, "blocked": 2, "optional": 1 },
  "worstSeverity": "error",
  "detail": "full",
  "durationMs": 68,
  "kits": [
    {
      "name": "deploy",
      "passed": false,
      "counts": {},
      "worstSeverity": "error",
      "failOn": "error",
      "reportOn": "recommend",
      "durationMs": 68,
      "checklists": []
    }
  ]
}
```

- **`passed`** is the run verdict, agreeing with exit code 0 in every case. Kit and checklist entries carry their own.
- **`counts`** holds the six tallies at report, kit, and checklist level, nested so count names and verdict names share no namespace.
- **`worstSeverity`** is derived verdict data, omitted when nothing failed.
- **`failOn`** and **`reportOn`** appear at the top level only when the corresponding flag was passed, and on every kit that ran as the value that governed it. See [thresholds](#thresholds) for how each resolves.
- **`warnings`** carries any advisory as `{ code, message, remedy? }`, absent when none was raised.

Payloads are slim by construction: a field carrying nothing is omitted rather than emitted as `null`, empty `checks` arrays are dropped, and `fix` appears only on failed checks.

### Detail level

`--detail summary` keeps counts, verdicts, and worst severity but reduces the detail tree to failed checks and their fixes -- the shape an agent needs, at a fraction of the tokens. `--detail full` is the default.

Both projections are described by `report.v1.json`, and the report's own `detail` field names which one was received. Passing `--detail` without `--json`, or to any command other than `run`, is a usage error.

## Publishing kits

The path from source to a consumer:

1. Author `.readyup/kits/<name>.ts`.
2. Run `rdy compile` to bundle it to `<name>.js` and record its hashes in `.readyup/manifest.json`.
3. Commit both the compiled `.js` and the manifest.
4. Consumers run `rdy run --from github:org/repo`, which fetches the bundle the manifest describes.
5. Run `rdy verify` in CI to catch a bundle edited by hand or a source left uncompiled.

### Compiling

```
rdy compile                    Compile every source in the config's srcDir
rdy compile <file>             Compile a single file
```

| Option                | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| `--output, -o <path>` | Output file path (single-file mode only)                    |
| `--manifest <path>`   | Manifest file path (default: `.readyup/manifest.json`)      |
| `--skip-manifest`     | Do not read or write the manifest                           |
| `--force`             | Overwrite compiled kits that have drifted from the manifest |
| `--json`              | Report each kit's status as JSON                            |

```
── Compiling kits in .readyup/kits

🟢 deploy.ts -> 📦 deploy.js
⚪ smoke.ts · no changes
```

A sweep runs to completion: a kit that fails is reported, the next is tried, and the run exits 1. A failed kit is never recorded as though it had compiled, and one compiled previously keeps its existing manifest entry.

`rdy compile` refuses to overwrite a compiled kit whose on-disk hash differs from the manifest's recorded `targetHash` -- someone edited the bundle directly:

```
🟠 deploy.ts
   drift in deploy.js: expected 6f58905a, got eb104f57

1 of 2 kits skipped due to drift. Re-run with --force to overwrite, or move edits into the source.
```

Under `--json`, each kit reports `name`, `status` (`compiled`, `skipped`, or `failed`), and the reason it was skipped or failed.

### Internal kits

Internal kits are TypeScript sources a repo runs on itself rather than publishing. The `internal.dir` and `internal.infix` [config keys](#config) locate them.

An **infix** is a segment between the kit name and the extension. With `infix: 'internal'`, the kit `deploy` lives at `deploy.internal.ts`; with no infix configured -- the default -- it is simply `deploy.ts`.

```ts
export default defineRdyConfig({
  internal: { dir: 'internal', infix: 'internal' },
});
```

`rdy run --internal <name>` resolves through these settings, and `rdy list` buckets sources under **Internal** and bundles under **Compiled**.

### Verifying

```
rdy verify                     Check compiled kits against the manifest's hashes
rdy verify --manifest <path>   Use a manifest other than .readyup/manifest.json
```

```
── Verifying kits against .readyup/manifest.json

🔴 deploy
   drift (expected 6f58905a, got eb104f57)
🟢 smoke

1 of 2 kits failed verification.
```

Each kit carries two independent verdicts, because a kit is two artifacts. The compiled output is `ok`, `drift`, `missing`, or `unverified`; the source is `ok`, `stale`, `missing`, or `unverified`. `drift` means someone edited the bundle by hand; `stale` means the source moved on and nobody recompiled. A kit can be both at once.

Anything other than `ok` or `unverified` on either axis fails the run. `unverified` does not, since an entry with no recorded hash says nothing about whether the kit changed.

Under `--json`, each kit reports `status` and `sourceStatus`. A `drift` verdict carries `expected` and `actual`; a `stale` verdict carries `sourceExpected` and `sourceActual`.

In CI:

```yaml
- run: npx rdy verify
```

`rdy verify` enforces where `rdy run` advises: a stale source fails verification and exits 1, while a run emits a warning and proceeds. A verification tool that refused to run because its own bookkeeping was out of date would be worse than one that ran and said so.

## Check utilities

Reusable check functions for common assertions:

```ts
import { fileExists, hasPackageJsonField } from 'readyup/check-utils';
```

### Filesystem

| Function                            | Returns                             |
| ----------------------------------- | ----------------------------------- |
| `fileExists(path)`                  | File exists                         |
| `filesExist(paths, options?)`       | `CheckOutcome` over several paths   |
| `readFile(path)`                    | Contents, or `undefined` if missing |
| `fileContains(path, pattern)`       | File matches a `RegExp`             |
| `fileDoesNotContain(path, pattern)` | File does not match a `RegExp`      |
| `commandExists(name)`               | Command is on `PATH`                |

### JSON

| Function                            | Returns                                   |
| ----------------------------------- | ----------------------------------------- |
| `readJsonFile(path)`                | Parsed object, or `undefined`             |
| `readJsonValue(path, ...keys)`      | Value at a key path within a file         |
| `hasJsonField(path, field, value?)` | Field exists, optionally matching a value |
| `hasJsonFields(path, fields)`       | `CheckOutcome` over several fields        |
| `getJsonValue(obj, ...keys)`        | Value at a key path within an object      |
| `hasJsonValue(obj, ...keys)`        | Key path is present                       |
| `isRecord(value)`                   | Type guard for `Record<string, unknown>`  |

### Package manifests

| Function                                    | Returns                                   |
| ------------------------------------------- | ----------------------------------------- |
| `readPackageJson()`                         | Parsed `package.json`                     |
| `hasPackageJsonField(field, value?)`        | Field exists, optionally matching a value |
| `hasDevDependency(name)`                    | Dev dependency is declared                |
| `hasMinDevDependencyVersion(name, version)` | Dev dependency meets a minimum            |

### Versions and runtime alignment

| Function                             | Returns                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `compareVersions(a, b)`              | Comparison of two semver strings                                                         |
| `readEnginesNodeFloor(manifest)`     | `{ kind: 'found', floor, raw }`, `{ kind: 'absent' }`, or `{ kind: 'unparseable', raw }` |
| `satisfiesNodeFloor(version, floor)` | Whether a runtime meets a floor; `undefined` if either is uncomparable                   |
| `readToolVersionsNode(path?)`        | Node version declared in `.tool-versions`                                                |
| `esYearForNodeMajor(major)`          | ECMAScript year a Node major supports (`24` → `es2025`)                                  |
| `readTsconfigLanguageLevel(path)`    | Effective `lib` and `target`, resolved through `extends`                                 |

Each reader answers only what it can see, so a check composing them decides for itself what each unknown means. `readEnginesNodeFloor` recognizes only forms from which a single floor follows (`>=24`, `^22.1`, `24.1.0`); a union or wildcard comes back `unparseable` rather than an invented floor. `readTsconfigLanguageLevel` also returns `chain` (the configs it read) and `unresolvedExtends` (references it could not follow), so a check can tell an incomplete answer from an undeclared setting.

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

### Git

| Function                                 | Returns                                           |
| ---------------------------------------- | ------------------------------------------------- |
| `runGit(path, ...args)`                  | Trimmed stdout of a git command                   |
| `isGitRepo(path)`                        | Path is inside a git working tree                 |
| `isAtRepoRoot(path)`                     | Path is the top of a working tree                 |
| `expandHome(path)`                       | Leading `~` expanded to the home directory        |
| `compareLocalRefs(path, refA, refB)`     | Discriminated union comparing two local refs      |
| `compareRefToRemote(path, ref, remote?)` | Discriminated union comparing a ref to its remote |
| `makeLocalRefSyncCheck(options)`         | An `RdyCheck` verifying two local refs match      |
| `makeRemoteRefSyncCheck(options)`        | An `RdyCheck` verifying a ref matches its remote  |

### Hashing

| Function                          | Returns                          |
| --------------------------------- | -------------------------------- |
| `computeHash(content)`            | Hash of a string                 |
| `fileMatchesHash(path, expected)` | File's hash matches the expected |

### Workspaces

`discoverWorkspaces()` returns a uniform `Workspace[]` collapsing pnpm, npm, and yarn monorepo conventions -- and single-workspace repos -- into one iteration shape. Each entry carries `dir` (relative to `cwd`; `'.'` for a single-workspace repo), `absolutePath`, `name`, `isPackage` (`package.json.private !== true`), and the parsed `packageJson`.

```ts
const packages = discoverWorkspaces({ filter: (w) => w.isPackage });
```

`pnpm-workspace.yaml` is read by a minimal block-sequence parser; configs using YAML anchors, flow sequences, or negation patterns raise a clear error.

## Compatibility

`readyup/check-utils` is the stable, versioned surface for kit-author imports. It follows semver: no breaking changes within a major version.

Compiled kits embed nothing of readyup itself -- the runner satisfies `readyup` and `readyup/*` imports at runtime via its module-resolution hook. Kits are therefore version-coupled to the runner across breaking boundaries: when upgrading across a major, recompile with `rdy compile`.

## License

MIT
