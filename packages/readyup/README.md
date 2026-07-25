# readyup

Run pre-deployment verification checks against your environment and configuration. Define checklists in TypeScript kits, run them locally or from a remote source, and get clear pass/fail reporting with remediation hints.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add --save-dev readyup
```

Node 24 or later is required, for the runner and for the kits it compiles.

## Quick start

Install readyup as shown above, then scaffold a starter config and kit:

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
          name: 'environment variables set',
          check: () => Boolean(process.env['NODE_ENV']),
          fix: 'Set NODE_ENV before deploying',
        },
      ],
    },
  ],
});
```

Compile the kit, then run the checks:

```bash
rdy compile
rdy run
```

Compiling reports what it rebuilt:

```
── Compiling kits in .readyup/kits

🟢 default.ts -> 📦 default.js
```

Running reports what it found. With `NODE_ENV` unset, the starter check fails and its remediation is recapped at the end, attributed to the check that raised it:

```
🔴 environment variables set

🔴 1 error (0ms)

── Fixes

💊 environment variables set
   Set NODE_ENV before deploying
```

The failed line carries only its claim, because this check reports no reason of its own -- it returns a bare `false`. Returning a `detail` instead is what puts an explanation beneath the claim; see [the `detail` contract](#the-detail-contract).

`rdy compile` bundles `.readyup/kits/default.ts` into `.readyup/kits/default.js`, and `rdy run` loads that compiled kit. Recompile whenever the source changes.

To skip compiling and run straight from the TypeScript source, use `rdy run --jit`. It reads the same `.readyup/kits/default.ts` and needs no compiled bundle, which makes it the faster loop while you are still writing checks. Compiled kits stay the vetted artifact: they are what `rdy verify` hashes and what a consumer running `rdy run --from` gets.

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

| Option                        | Description                                                    |
| ----------------------------- | -------------------------------------------------------------- |
| `--from <source>`             | Kit source (see [kit sources](#kit-sources) below)             |
| `--file, -f <path>`           | Path to a local kit file                                       |
| `--url <url>`                 | Fetch kit from a URL                                           |
| `--jit`                       | Run from TypeScript source instead of compiled JS              |
| `--internal`                  | Use internal kit directory and infix from config               |
| `--checklists, -c <name,...>` | Filter checklists within the selected kit                      |
| `--json`                      | Output results as JSON                                         |
| `--detail <summary\|full>`    | How much of the JSON report to emit (default: `full`)          |
| `--fail-on <severity>`        | Fail on this severity or above (`error`, `warn`, `recommend`)  |
| `--quiet`                     | Hide passed checks from the report; incompatible with `--json` |
| `--report-on <severity>`      | Show this severity or above (`error`, `warn`, `recommend`)     |

`--checklists` selects checklists within one kit. Pair it with a single positional kit, with `--file` or `--url`, or with no kit at all to filter the default kit. Naming two or more kits, or naming one that already carries a `:checklist` filter, is an error rather than a merge.

`--report-on` prunes only the reported detail tree, and keeps the parent checks of anything it shows so nesting stays intact. Summary counts, worst severity, and the exit code always reflect the whole run.

`--quiet` hides passed check lines from the human report, keeping failures, skips, blocks, the fix recap, and every count line. It filters by status where `--report-on` filters by severity, so the two compose rather than override, and both keep the parent checks of anything they show: a failure nested under passing parents stays reachable through them. Counts and the exit code still cover the whole run. Because it changes only the human report, pairing it with `--json` is a usage error rather than a silently ignored flag.

### Reading the output

Every command renders through one layout engine, so a line means the same thing wherever it appears.

| Token | Meaning                                                         |
| ----- | --------------------------------------------------------------- |
| 🟢    | passed; `verify` ok; a file created, overwritten, or up to date |
| 🔴    | failed at `error` severity; `verify` drift or missing           |
| 🟠    | failed at `warn` severity; a compile drift-skip                 |
| 🟡    | failed at `recommend` severity                                  |
| ⚪    | skipped: not applicable, already present, or no work needed     |
| 🚫    | blocked, because a precondition failed                          |
| 💊    | a remediation hint                                              |

📄 and 📦 are noun glyphs, not statuses: they name a TypeScript source and a compiled bundle. They lead the line in `list`, where a row names a kit instead of reporting an outcome, and sit mid-line in compile's transformation lines. Both declare the same width as every status token, which is what makes the leading position safe.

A check line reads `token name · detail [progress] (duration)`. The middle dot is the only detail separator, so progress takes brackets rather than a second one, and compile's transformation lines take an ASCII `->`. Durations appear from 100 ms up, never on a check that did not run, and always on a tail or total line.

**A failed line carries only its claim.** The reason renders beneath it, indented to the name column -- the authored `detail` first, then any thrown exception behind its `Error:` label. A failed check that authored neither renders no reason block at all. Passes and skips keep their detail inline.

Tail and total lines lead with the run's worst severity rather than its passed count, then report the counts in a fixed order -- passed, errors, warnings, recommendations, blocked, skipped -- omitting any field that is zero.

Headings come from one family whose rule weight encodes level: `━━` for a kit, `──` for a checklist, a step, or a summary. When more than one checklist runs, a table follows, its rules sized to the widest row:

```
── build

🟢 typecheck (343ms)
🟢 bundle size · 42kB of a 50kB budget [84%]

🟢 2 passed (343ms)

── integration

🟢 database reachable
🔴 migrations applied (151ms)
   2 migrations pending: add_users, add_index
⚪ seed data loaded · seeding is disabled outside CI

🔴 1 passed | 1 error | 1 skipped (151ms)

── Fixes

💊 migrations applied
   Run `pnpm migrate` against the target database

── Summary

─────────────────────────────────────────────────────
🟢 build        343ms  2 passed
🔴 integration  151ms  1 passed | 1 error | 1 skipped
─────────────────────────────────────────────────────
🔴 Total: 3 passed | 1 error | 1 skipped (494ms)
```

Under `--quiet`, that run keeps everything except `typecheck`, `bundle size`, and `database reachable`.

### Advisory warnings

`rdy run` compares the kits it is about to run against `.readyup/manifest.json` in the current working directory, and says so when the two disagree. Warnings go to stderr in both output modes and appear under `warnings` in the JSON report; none of them affects the exit code.

| Code           | Raised when                                                                   |
| -------------- | ----------------------------------------------------------------------------- |
| `source-stale` | The kit's TypeScript has changed since the compiled bundle was built from it  |
| `target-drift` | The compiled bundle no longer matches the hash the manifest recorded for it   |
| `version-skew` | The kit was compiled against a readyup version that differs from the runner's |

The staleness warnings are silent when that manifest is absent, when no entry in it describes the kit being run, when the entry records no hashes, or when a file they would hash cannot be read. That one manifest is the only one consulted, so a kit reached through `--from` is outside their scope: it resolves under another root, whose own manifest `rdy run` never reads. Run `rdy verify` in that root to check those kits. The warnings also do not apply to `--url` sources, which no local manifest describes, or to `--jit`, which runs the source directly. `rdy verify` is the enforcing gate; see [the staleness model](#the-staleness-model).

### Exit codes

| Code | Meaning                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Ran and found no problems                                                                                                     |
| `1`  | Ran and found problems with the repo or its kits: failed checks, a `verify` drift or missing kit, a kit that fails to compile |
| `2`  | Could not complete the invocation: a usage, config, kit-load, or internal error                                               |

The distinction is between "fix the repo" (`1`) and "fix the invocation" (`2`), so a pipeline can branch on which is which. `rdy list` and `rdy init` produce only `0` and `2` -- neither can find problems to report.

A run that loses a kit part-way exits `2` even when the kits that ran also found problems, since part of the invocation did not complete. It still reports what it collected.

### JSON output

`run`, `compile`, `list`, and `verify` all accept `--json`. `init` does not: scaffolding is interactive and stays human-only.

With `--json`, stdout carries exactly one JSON document and every human-readable line -- headers, progress, warnings, errors -- goes to stderr. The exceptions are `--help` and `--version`, which have no JSON form: their text goes to stderr and stdout stays empty.

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
- **Removing, renaming, or re-typing a field does bump it**, and publishes a new `vN` file beside the old one. Widening a closed set of values -- an error `code`, a check `status` -- counts as re-typing.
- **A field is `required` only when every payload carries it.** Omission is reserved for genuinely absent or empty data, so a present field never means "nothing here".
- **`warnings[].code` is an open set**, exempt from the widening rule above: the schema accepts a known code or any other string, so a newly raised advisory never bumps the version. Consumers must tolerate a code they have not heard of, displaying its `message` and `remedy` as they would any other. `error.code` stays closed, because an unknown error code leaves a consumer with no branch to select, and that is a break worth announcing.

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

- **`passed`** is the run verdict: true when every requested kit produced results and every kit passed under its own `failOn`, so it agrees with exit code 0 in every case. Kit and checklist entries carry their own `passed`, which means the narrower "nothing at or above this kit's `failOn` failed here".
- **`counts`** holds the six result tallies at the report, kit, and checklist levels. They nest rather than sitting flat so the count names and the verdict names share no namespace, which is what makes the additive-evolution rule above sound rather than merely conventional.
- **`worstSeverity`** sits beside `counts` -- it is derived verdict data, not a count -- and is omitted when nothing failed.
- **`failOn`** and **`reportOn`** appear in two places, answering two different questions. At the top level they report what the invocation _requested_, so each is present only when you passed the flag: absence means "not requested", never "defaulted". On each kit that ran they report the threshold that _governed_ it, resolved as CLI flag, then the kit's own declaration, then the default, and both are always present there. The two differ whenever a kit declares its own, which is also why a kit's verdict cannot be recomputed from a run-level value and why a multi-kit run needs one threshold per kit rather than one for the report.
- **`detail`** has no per-kit form, so requested and effective are the same value and it is always present at the top level.
- **`warnings`** carries any advisory the run raised, as `{ code, message, remedy? }`. Warnings keep their stderr line in both modes; under `--json` they are captured here as well, because a consumer that owns only stdout would otherwise never see them. The field is absent when the run raised none.

Payloads are slim by construction: a field carrying nothing is omitted rather than emitted as `null`, empty `checks` arrays are dropped, durations are whole milliseconds, and `fix` appears only on checks that failed.

#### Choosing how much detail to receive

`--detail summary` keeps the counts, verdicts, and worst severity but reduces the detail tree to the checks that failed and the fixes they carry -- the shape an agent needs to decide what to do next, at a fraction of the tokens. `--detail full` is the default and keeps every reported check.

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

Each section names the command that runs the kits beneath it, on its own line so it can be copied without the label:

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

`--manifest` reads a manifest instead, reporting each kit's compile-time readyup version and its description:

```
── Manifest: .readyup/manifest.json

📦 deploy (readyup v0.22.0) · Pre-deployment checks
📦 smoke (readyup v0.22.0)
```

A local `--from` source with no manifest beside its kits falls back to listing the compiled kits on disk, which are the same kits `rdy run --from` would resolve. Those rows carry a name and a path only; descriptions, checklist names, and versions live in the manifest that is absent. A remote source still requires one.

Under `--json`, each row reports `name`, `kind` (`internal` for a TypeScript source, `compiled` for a bundle), `path`, and -- for kits a manifest describes -- `checklists`, `description`, and `readyupVersion`. Checklist names are read from the manifest, so listing kits never imports a compiled bundle and never runs kit code.

Rows are keyed by `name` and `kind` together, not by `name` alone. Under the default configuration both the internal source directory and the compile output directory resolve to `.readyup/kits`, so a compiled source appears twice: once as `internal`, which `rdy run --jit <name>` runs, and once as `compiled`, which `rdy run <name>` runs. Both rows are meaningful, so a consumer indexing on `name` alone silently drops one of them.

### Compile

```
rdy compile                    Compile every source in the config's srcDir
rdy compile <file>             Compile a single file
```

A rebuilt kit names its output; one whose bundle is already current says so instead:

```
── Compiling kits in .readyup/kits

🟢 deploy.ts -> 📦 deploy.js
⚪ smoke.ts · no changes
```

A sweep runs to completion: a kit that fails to compile is reported and the next kit is tried, so one broken kit cannot hide the state of the kits that sort after it. A kit that failed is never recorded as though it had compiled, and the run exits 1. A kit that had been compiled before keeps the entry it already had, because that entry still describes the tree: a bundling failure leaves the previous output and its recorded hash untouched, and a validation failure deletes the output, which `rdy verify` then reports as missing. Dropping the entry would hide both, and would leave the next successful compile with no record to check drift against.

`rdy compile` refuses to overwrite a compiled kit whose on-disk hash differs from the manifest's recorded `targetHash`; someone edited the compiled file directly. Drifted kits are reported and skipped, with the mismatch beneath the kit that carries it:

```
── Compiling kits in .readyup/kits

🟠 deploy.ts
   drift in deploy.js: expected 6f58905a, got eb104f57
⚪ smoke.ts · no changes

1 of 2 kits skipped due to drift. Re-run with --force to overwrite, or move edits into the source.
```

`--force` overwrites them anyway.

Each kit's checklist names are recorded in the manifest so `rdy list` can report them without running the kit. The field is optional and absent from manifests written by earlier versions, so the manifest format stays at version 1.

Under `--json`, each kit reports `name`, `status` (`compiled`, `skipped`, or `failed`), and the reason it was skipped or failed.

### Verify

```
rdy verify                     Check compiled kits against the manifest's hashes
```

A verified kit carries nothing beyond its token; a failing one carries each verdict on the line beneath it:

```
── Verifying kits against .readyup/manifest.json

🔴 deploy
   drift (expected 6f58905a, got eb104f57)
🟢 smoke

1 of 2 kits failed verification.
```

Each kit carries two independent verdicts, because a kit is two artifacts: the TypeScript source and the bundle compiled from it.

The compiled output is reported as `ok`, `drift`, `missing`, or `unverified`. The source is reported as `ok`, `stale`, `missing`, or `unverified`. Both axes are checked for every kit, and a kit can be stale at the source and drifted at the target at once: `drift` means someone edited the bundle by hand, while `stale` means the source moved on and nobody recompiled.

Anything other than `ok` or `unverified` on either axis fails the run. `unverified` does not, since a manifest entry with no recorded hash says nothing about whether the kit has changed; a manifest written before source hashes existed reports `unverified` for the source and still passes.

Under `--json`, each kit reports `status` for the compiled output and `sourceStatus` for the source. A `drift` verdict carries `expected` and `actual`; a `stale` verdict carries `sourceExpected` and `sourceActual`. `sourceStatus` is optional in the published schema, so a consumer pinned to `verify.v1.json` still validates payloads from an earlier readyup.

### The staleness model

Editing a kit's `.ts` without recompiling leaves `rdy run` executing the bundle it was compiled from, which is no longer what the source says. The two commands treat that differently on purpose:

- **`rdy verify` enforces.** A stale source fails the run and exits 1. This is the gate to put in CI.
- **`rdy run` advises.** It emits a warning and runs anyway, leaving the exit code alone. A verification tool that refused to run because its own bookkeeping was out of date would be worse than one that ran and said so.

## Authoring API

All helpers are type-safe identity functions that provide editor autocomplete without runtime overhead. Import them from `readyup`.

| Helper                     | Description                          |
| -------------------------- | ------------------------------------ |
| `defineRdyConfig`          | Repo-level config                    |
| `defineRdyKit`             | Kit (collection of checklists)       |
| `defineRdyChecklist`       | Flat checklist                       |
| `defineRdyStagedChecklist` | Staged checklist (sequential groups) |
| `defineChecklists`         | Array of checklists                  |

### The `detail` contract

A check may return a `CheckOutcome` rather than a bare boolean, carrying a `detail` string and optional `progress`. One rule governs what belongs in `detail`:

> **`detail` answers "why this status".**

Not "what this check asserts" -- the check's `name` already says that, and repeating it in `detail` doubles the line's width without adding a fact. On a pass, `detail` reports the evidence. On a skip, it reports why the check did not apply. On a failure, it reports what went wrong, and it is the text that renders beneath the claim.

Where the detail lands follows from the status, so an author writes one field and the report places it:

| Status  | Where `detail` renders                                  |
| ------- | ------------------------------------------------------- |
| passed  | inline, after the middle dot                            |
| skipped | inline, after the middle dot (return it from `skip`)    |
| failed  | in a block beneath the claim, above any thrown `Error:` |

Remediation is not detail. It belongs in `fix`, which is recapped at the end of the report against the check that raised it.

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
          name: 'dependencies',
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
              name: 'native modules rebuilt',
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
🟢 dependencies
   🟢 lockfile is current [4 of 4]
      🔴 no duplicated majors
         react resolves to both 18.3.1 and 19.0.0
   ⚪ native modules rebuilt · no native dependencies in this workspace

🔴 3 passed | 1 error | 1 skipped (0ms)

── Fixes

💊 no duplicated majors
   Run `pnpm dedupe`, then commit the lockfile
```

Four things to read off that output:

- **`dependencies` passed, which is why anything beneath it ran at all.** A check that fails blocks its descendants, so they report 🚫 without running. The 🔴 on `no duplicated majors` is reachable only because both checks above it passed, and a failing descendant is what turns the tail line red while every ancestor stays green.
- **`no duplicated majors` sits at the third level, and its reason lines up under its own name** -- one indent step per level, so a reason is never mistaken for a check.
- **No check line carries a duration.** Every check here returns immediately, and durations appear only from 100 ms up, so a fast report is not littered with `(0ms)`. The tail line shows the run's total regardless.
- **`progress` needs no `detail`.** `[4 of 4]` is the evidence; a detail restating it would spend the line's one separator to say the same thing twice.

### Preconditions

A checklist's `preconditions` gate the checks that follow it. If any precondition fails, every check in the checklist is skipped, and each skipped result records `precondition` as its reason.

Two rules govern the gate:

- **A failed precondition gates regardless of its severity.** A precondition declared `recommend` gates exactly as one declared `error` does. Severity decides whether the run _fails_; the gate decides whether the checks are worth _running_, and those are separate questions. A `recommend` precondition that fails under the default `--fail-on error` therefore skips the whole checklist and still exits 0.
- **A precondition skipped `n/a` does not gate.** "The gate does not apply" is not "the gate failed", so the checklist runs in full. To make a whole checklist inapplicable instead, nest its checks under a single parent check whose `skip` returns a reason: an `n/a` skip terminates its own subtree, and nothing beneath it produces a result.

Precondition results and the checks they skip follow the same reporting threshold as everything else: a result appears in the output only when its own severity is at or above `--report-on`.

### Kit validation

The authoring helpers are type-level only, and neither `rdy compile` nor `rdy run --jit` type-checks the kit it loads, so both commands validate the kit's structure at load time. Validation is the same in both, which means `rdy compile` refuses to publish a kit that `rdy run` would reject.

Every check is validated wherever it appears: in a checklist's `checks`, in a staged checklist's `groups`, in its `preconditions`, and in the `checks` nested under another check. A check must carry a non-empty `name` and a `check` function; `severity` must be one of `error`, `warn`, or `recommend`; `skip` must be a function and `fix` a string when present. Unknown extra keys are allowed, so a kit written for a later readyup still loads.

A typo'd `severity` is the mistake this catches that matters most: before validation reached individual checks, an unrecognized value silently excluded the check from both the failure and the reporting thresholds, and the run passed.

Failures name the kit and the location of each offending value:

```
Invalid kit at .readyup/kits/default.js:
  checklists[0].checks[1].severity: expected one of "error", "warn", "recommend", got "info"
  checklists[0].checks[2].check: expected a function, got string
```

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

`discoverWorkspaces()` returns a uniform `Workspace[]` that collapses pnpm, npm, and yarn monorepo conventions -- and single-workspace repos -- into one iteration shape. Every entry includes `dir` (relative to `cwd`; `'.'` for a single-workspace repo), `absolutePath`, `name`, `isPackage` (true when `package.json.private !== true`), and the parsed `packageJson`.

Common filter pattern -- get all publishable workspaces:

```ts
import { discoverWorkspaces } from 'readyup/check-utils';

const packages = discoverWorkspaces({ filter: (w) => w.isPackage });
```

Note: `pnpm-workspace.yaml` is read by a minimal block-sequence parser; configs using YAML anchors, flow sequences, negation patterns, or other non-trivial features will raise a clear error with a pointer to file an issue.

### Reading runtime alignment

`readTsconfigLanguageLevel(path)` reports what language level a tsconfig actually declares, which may be several `extends` hops away. Alongside `lib` and `target` -- lowercased, so comparisons are string equality -- it returns `chain`, the configs it read with the entry file first, and `unresolvedExtends`, the references it could not follow. Bare package specifiers such as `@tsconfig/node24/tsconfig.json` are never followed, and a missing or unparseable parent ends that branch of the walk; both land in `unresolvedExtends`, so a check can tell an incomplete answer from a genuinely undeclared setting. A missing or unparseable entry file returns `undefined`. Configs are read as JSONC, so comments and trailing commas are fine.

`readEnginesNodeFloor(manifest)` recognizes only the range forms from which a single floor follows: `>=24`, `^22.1`, and a bare `24.1.0`. Anything else -- a union such as `^20 || ^22`, a hyphen range, a wildcard -- comes back as `{ kind: 'unparseable' }` rather than an invented floor. It takes an already-parsed manifest, so it composes with `discoverWorkspaces` without re-reading files.

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

Compiled kits embed nothing of readyup itself -- the runner satisfies `readyup` and `readyup/*` imports at runtime via its module-resolution hook. Kits are therefore version-coupled to the runner across breaking boundaries: when you upgrade readyup across a major, recompile your kits with `rdy compile` so any newly-shipped or changed check utilities are picked up.

## License

MIT
