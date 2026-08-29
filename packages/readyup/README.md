# ReadyUp

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
          check: () => {
            const value = process.env['NODE_ENV'];
            if (!value) return { ok: false, detail: 'NODE_ENV has no value in the environment' };
            return { ok: true, detail: `NODE_ENV is ${value}` };
          },
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
   NODE_ENV has no value in the environment
── Fixes
🔴 NODE_ENV is set
   💊 Set NODE_ENV before deploying
🔴 Total: 1 error (0ms)
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

Every check has a severity. It decides whether a failure fails the run and whether the result is reported, and it never decides whether that check itself runs. It reaches later work in one place only: a failed check at or above the failure threshold stops the remaining groups of a [staged checklist](#staged-checklists).

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

💊 `FIX` marks a remediation hint rather than a result.

Role glyphs are nouns rather than statuses. They name what something is, in a heading segment or beside a listed row, and plain style renders none of them: position shows the meaning instead.

| Rich | Names                                                  |
| ---- | ------------------------------------------------------ |
| 📄   | a kit's TypeScript source                              |
| 📓   | a kit                                                  |
| 📋   | a checklist                                            |
| 📦   | the npm package a kit was published in                 |
| 🌐   | a kit fetched from `github:`, `bitbucket:`, or `--url` |
| 📁   | a directory a kit was read from                        |

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
| `packages`        | none            | Packages `rdy run --packages` runs a published kit from       |

See [internal kits](#internal-kits) for what the `internal` keys select, and [package-hosted kits](#package-hosted-kits) for `packages`.

### Kit

| Field               | Type                         | Default     | Meaning                                    |
| ------------------- | ---------------------------- | ----------- | ------------------------------------------ |
| `checklists`        | `Array<Checklist \| Staged>` | required    | The checklists this kit runs               |
| `description`       | `string`                     | --          | Summary, reported by `rdy list --manifest` |
| `minReadyupVersion` | `string`                     | --          | Readyup version the checks require         |
| `suites`            | `Record<string, string[]>`   | --          | Named subsets of checklists                |
| `defaultSeverity`   | `Severity`                   | `error`     | Severity for checks that declare none      |
| `failOn`            | `Severity`                   | `error`     | Failure threshold                          |
| `reportOn`          | `Severity`                   | `recommend` | Reporting threshold                        |
| `fixLocation`       | `'inline' \| 'end'`          | `end`       | Where fixes render                         |

A kit declaring `minReadyupVersion` fails to load on a runner below it. A kit declaring none falls back to an advisory floor, the version its bundle records at compile time, which a lower runner reports as a [`version-skew`](#advisory-warnings) warning rather than a failure.

### Checklists

| Field           | Type                | Default            | Meaning                                     |
| --------------- | ------------------- | ------------------ | ------------------------------------------- |
| `name`          | `string`            | required           | Display name                                |
| `checks`        | `RdyCheck[]`        | required if flat   | Checks, run concurrently (flat checklist)   |
| `groups`        | `RdyCheck[][]`      | required if staged | Groups, run sequentially (staged checklist) |
| `preconditions` | `RdyCheck[]`        | --                 | Gating checks                               |
| `fixLocation`   | `'inline' \| 'end'` | the kit's setting  | Overrides the kit's setting                 |

A checklist has either `checks` or `groups`, never both.

### Checks

| Field      | Type                                              | Default                     | Meaning                                       |
| ---------- | ------------------------------------------------- | --------------------------- | --------------------------------------------- |
| `name`     | `string`                                          | required                    | The claim being asserted                      |
| `id`       | `string`                                          | --                          | What a pragma writes to suppress its findings |
| `check`    | `() => boolean \| CheckOutcome \| FindingOutcome` | required                    | The assertion; may be async                   |
| `severity` | `Severity`                                        | the kit's `defaultSeverity` | Overrides the kit's `defaultSeverity`         |
| `quiet`    | `boolean`                                         | `false`                     | Renders only when the check does not pass     |
| `skip`     | `() => false \| string`                           | --                          | Reason string to skip; `false` to run         |
| `fix`      | `string`                                          | --                          | Remediation, shown when the check fails       |
| `checks`   | `RdyCheck[]`                                      | --                          | Nested checks, run only if this one passes    |

A check returns a boolean or a `CheckOutcome`:

| Field      | Type       | Meaning                                                                      |
| ---------- | ---------- | ---------------------------------------------------------------------------- |
| `ok`       | `boolean`  | Whether the assertion holds                                                  |
| `detail`   | `string`   | Why this status                                                              |
| `progress` | `Progress` | `{ type: 'fraction', passedCount, count }` or `{ type: 'percent', percent }` |

A check naming located sites returns a `FindingOutcome` instead, and the runner derives all three from it:

| Field          | Type               | Meaning                                                                    |
| -------------- | ------------------ | -------------------------------------------------------------------------- |
| `findings`     | `OutcomeFinding[]` | Every located site, as `{ path, line, symbol?, reported }`                 |
| `adoptedCount` | `number`           | Sites already settled, the fraction's numerator; omitted, there is none    |
| `scanned`      | `string[]`         | Paths this check examined and read no other way; omitted, it declares none |

`reported` marks the sites this check names; the rest count toward the fraction and do nothing else. The runner drops the sites a [pragma suppresses](#suppressing-a-finding), renders the reported survivors as the `detail`, reads `ok` off whether any survived, and counts every survivor into the fraction. `buildFindingReport` builds one of these for the common case; see [project sources](#project-sources).

`scanned` is the escape hatch, not the usual path. A sweep read through [`readTrackedSources`](#project-sources) is recorded on its own, in `skip` and in `check` alike, so a check reading the project that way declares nothing and its files are still evidence for the [pragma that suppressed nothing](#advisory-warnings). Declare `scanned` where the check reads files another way -- shelling out to a tool, walking `listTrackedFiles` and reading them itself, or reaching for `fs` directly -- because nothing else can see what those read.

### Naming checks

Three fields, three questions:

> **`name` states what must be true. `detail` explains why this status. `fix` says what to do about it.**

A name is a claim that reads true on a pass and false on a fail. `🔴 Node >= 24` fails that test: the operator leaves the reader to infer which direction is the violation.

State the claim in the third person indicative and capitalize it like a sentence, so a column of names reads as a column of assertions rather than labels.

| Poor                         | Better                                     | Why                                                      |
| ---------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| `Node >= 24`                 | `Node.js runtime is v24 or later`          | words fix the direction, and the subject says which Node |
| `outdated dependencies`      | `Dependencies are current`                 | a name true on _failure_ inverts the status token        |
| `check git status`           | `Working tree is clean`                    | names the action, not the condition                      |
| `env vars`                   | `NODE_ENV is set`                          | names the subject, not the claim                         |
| `Docker`                     | `Docker is configured`                     | a bare noun asserts nothing to be true or false          |
| `extends recommended preset` | `renovate.json extends config:recommended` | a verb with no subject leaves the claim half-stated      |

Rewriting a name often exposes an ambiguous predicate: an author writing "newer than 24" frequently discovers they meant a floor of 24.

A check that exists only to gate the checks nested beneath it is no exception. It still reports a status of its own, so it still needs a claim.

Neither is a `quiet` check, though it looks like one: its name reaches the reader only on a failure, where the claim reads false. That is the rule working rather than breaking. The name states what must be true, and the line appears precisely when it is not.

### The detail contract

`detail` explains "why this status" -- not "what this check asserts", which the name already says. On a pass it reports the evidence; on a skip, why the check did not apply; on a failure, what went wrong. Write it as a complete sentence, capitalized and with no terminal period -- the register `name` and `fix` already use. A sentence whose subject is a code identifier keeps that identifier's own case, as in `package.json is missing or unreadable`.

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
          name: 'Working tree is clean',
          check: () => ({ ok: true, detail: 'There are no uncommitted changes' }),
        },
        {
          name: 'Dependencies are installed',
          check: () => true,
          checks: [
            {
              name: 'Lockfile is current',
              check: () => ({ ok: true, progress: { type: 'fraction', passedCount: 4, count: 4 } }),
              checks: [
                {
                  name: 'No dependency has duplicated majors',
                  check: () => ({ ok: false, detail: 'react resolves to both 18.3.1 and 19.0.0' }),
                  fix: 'Run `pnpm dedupe`, then commit the lockfile',
                },
              ],
            },
            {
              name: 'Native modules are rebuilt',
              check: () => true,
              skip: () => 'This workspace has no native dependencies',
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
🟢 Working tree is clean · There are no uncommitted changes
🟢 Dependencies are installed
   🟢 Lockfile is current [4 of 4]
      🔴 No dependency has duplicated majors
         react resolves to both 18.3.1 and 19.0.0
   ⚪ Native modules are rebuilt · This workspace has no native dependencies
── Fixes
🔴 No dependency has duplicated majors
   💊 Run `pnpm dedupe`, then commit the lockfile
🔴 Total: 1 error, 3 passed, 1 skipped (0ms)
```

A failing descendant turns the tail line red while every ancestor stays green. `progress` needs no `detail`: `[4 of 4]` is already the evidence.

### When a check skips

`skip` exists to prevent a wrong failure, not to suppress a right pass. A skip reports that the check does not apply to this repo, so the first question is whether the thing being checked is yours to assert about; only then ask what `check` would have returned.

- If `check` would have failed, and failing would misjudge a conformant repo, the skip is correct.
- If `check` would have passed, delete the skip and let the check pass.

The second question is a fast check, not the rule. A skip is correct whenever the subject is not yours to assert about, whatever `check` would have returned. Five checks from published kits separate the two cases:

| Check                                             | In the skipped state, `check` would     | Verdict                                                |
| ------------------------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| `eslint >= 10.0.0`                                | fail -- no version to satisfy the floor | the skip prevents a wrong failure                      |
| `.config/git-cliff.toml matches current template` | fail -- hash of a missing file          | the skip prevents a wrong failure                      |
| `audit-ci configs are under .config/audit-ci/`    | pass                                    | the skip masks a pass, in every passing state          |
| `code-quality workflow does not use nmr prepush`  | pass                                    | the skip masks a pass                                  |
| `.github/labels.yaml exists`                      | pass                                    | the skip is correct; release-kit does not own the file |

The last row is the one the fast check alone gets wrong. `.github/labels.yaml` is a filename several label-sync tools write, and release-kit generates it only from a `repoLabels` block, so a repo with that file but no such block would have passed `fileExists` and still deserves the skip.

The third row is the failure mode to watch for: `skip` and `check` ran the identical predicate, so the check could never pass. [`rdy run --diagnose`](#run-options) decides that mechanical half, reporting every check its own `skip` turned off that would have passed. It decides nothing about applicability.

**Only a skipping parent collapses a group.** A parent whose `skip` fires reports alone: its descendants are not run, not reported, and not counted. A parent that _fails_ instead renders every descendant as its own 🚫, which is one blocked line per descendant where one skipped line was wanted. `quiet` helps with neither, suppressing passes only.

**⚪ and 🚫 read differently.** ⚪ means the check does not apply; 🚫 means it never ran, because an ancestor failed or a [precondition](#preconditions) gated it. A blocked subtree does not consult a descendant's own `skip`, so a check that would have reported "does not apply" renders as blocked instead. Read a 🚫 as evidence about an ancestor, never about the thing the blocked check names.

**Prefer a plain-string `fix`.** Outcome-specific remediation belongs in `detail`, which the check returns after running and can therefore name what actually went wrong. A [getter](#validation) serves one purpose: reaching a value declared below the kit literal.

### Agent guidance

The doctrine above ships as agent guidance too, in a CodeAssembly content root under `agents/` in the installed package. A repo that names `readyup` under `packages` in its `.agents/codeassembly.yaml` and runs `codeassembly sync` gets it as the `consult-readyup-kits` skill, in every harness that repo targets.

The skill holds the judgment a kit author needs while writing; this README stays the reference for everything mechanical.

### Staged checklists

A staged checklist replaces `checks` with `groups`. Groups run in order; checks within a group run concurrently.

```ts
import { defineRdyStagedChecklist } from 'readyup';

export default defineRdyStagedChecklist({
  name: 'release',
  groups: [[{ name: 'Working tree is clean', check: () => true }], [{ name: 'Tests pass', check: () => true }]],
});
```

A failure at or above the [failure threshold](#thresholds) stops the groups after it; a below-threshold failure is reported and the next group still runs. Only top-level results gate: a failing _nested_ check does not halt the next group.

This is the one gate that consults the threshold. A failed check blocks its own descendants, and a failed precondition gates its checklist, whatever the severity.

### Preconditions

A checklist's `preconditions` gate the checks that follow. If any precondition fails, every check is skipped and each records `precondition` as its reason.

- **A failed precondition gates regardless of severity.** Severity decides whether the run fails; the gate decides whether the checks are worth running. Unlike a staged checklist's groups, the gate does not consult the [failure threshold](#thresholds).
- **A precondition skipped `n/a` does not gate.** To make a whole checklist inapplicable, nest its checks under one parent check whose `skip` returns a reason. [When a check skips](#when-a-check-skips) covers why that structure and not a failing parent.

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

Every check is validated wherever it appears: in `checks`, in `groups`, in `preconditions`, and nested. A check needs a non-empty `name` and a `check` function; `severity` must be a valid value; `skip` must be a function, and a `fix` written as a data property must be a string. Unknown keys are allowed, so a kit written for a later ReadyUp still loads.

```
Invalid kit at .readyup/kits/default.js:
  checklists[0].checks[1].severity: expected one of "error", "warn", "recommend", got "info"
  checklists[0].checks[2].check: expected a function, got string
```

A typo'd `severity` is the mistake this matters most for: an unrecognized value would otherwise exclude the check from both thresholds, and the run would pass.

A `fix` written as a getter is the half of `fix` validation that is deferred. Load leaves it unread, and the check that fails resolves it -- so a getter may reference a constant declared below the kit literal, and a check that passes, skips, or is blocked never invokes it. A getter that throws or yields a non-string is reported as `Unresolvable fix: ...` in that failure's remediation slot, rather than as a load error taking the whole kit down.

### Testing a kit

A kit's checks are ordinary functions, and the shape of the test follows what a check reads.

**A check that calls `discoverWorkspaces` itself** is tested against a real directory tree, with `cwd` pointed at it. Nothing is mocked, so the check sees the workspace list discovery actually produces, root included:

```ts
import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';

it('passes when every package README carries the marker', () => {
  using temp = createTempTree({
    'package.json': '{"name":"root","private":true}',
    'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
    'packages/alpha/package.json': '{"name":"alpha"}',
    'packages/alpha/README.md': '<!-- marker -->',
  });
  using _cwd = pointCwdAt(temp.dir);

  expect(readmesHaveMarkers()).toBe(true);
});
```

`createTempTree` and `pointCwdAt` are the helpers ReadyUp uses for its own suites; any equivalent will do, since what the pattern needs is a real tree and a `cwd` pointed at it.

Mocking `readyup/check-utils` instead is what produces a workspace list discovery cannot return -- most often one with no root entry, which every `!isRoot` filter then passes through untouched, so the filter is never exercised.

**A function that takes a `Workspace` parameter** needs a value rather than a tree. `readyup/testing` exports a builder for one:

```ts
import { makeWorkspace } from 'readyup/testing';

expect(skipIfNotPublishable(makeWorkspace({ packageJson: { name: 'example', private: true } }))).toBe(
  'package.json#private is true',
);
```

`makeWorkspace` fills every field the call leaves out, so a field added to `Workspace` in a later release does not break the fixture. Its defaults are:

| Field          | Default                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| `dir`          | `'packages/example'`                                                      |
| `absolutePath` | `/repo` joined to `dir`, in forward slashes: `'/repo/packages/example'`   |
| `packageJson`  | `{ name }`, the name being `dir`'s last segment, or `'repo'` for the root |
| `name`         | `packageJson.name`                                                        |
| `isPackage`    | `packageJson.private !== true`                                            |
| `isRoot`       | `dir === '.'`                                                             |

The last three are derived by the same code `discoverWorkspaces` uses, so `makeWorkspace({ dir: '.' })` reports `isRoot: true` without being told. An explicit override wins over the derivation, which is how a test states a shape discovery would not produce. The result is frozen, as a discovered workspace is, and the manifest passed in is copied before freezing, so a literal shared between fixtures stays writable.

### Inlining JSON at compile time

A compiled kit is self-contained, so it cannot read a JSON file that sits next to its source. `pickJson` closes that gap by copying selected fields into the bundle while it is being built:

```ts
import { pickJson } from 'readyup';

const pkg = pickJson('../../package.json', ['name', 'version', ['engines', 'node']]);
```

`rdy compile` replaces the call with the literal it resolves to. Nothing of `pickJson` survives, not even the import:

```js
var pkg = { "name": "my-app", "version": "3.1.0", "engines": { "node": ">=24" } };
```

The path resolves relative to the source file. Each entry in the second argument names a field to keep: a string for a top-level key, an array of strings for a nested one, whose nesting the result preserves. Naming a path the file does not have fails the compile rather than inlining `undefined`.

Both arguments must be literals written in place. They are read out of the source text before it is parsed, so a variable, a template literal, or a concatenation is a compile error -- and a call inside a comment or a string is still processed, since that reader cannot tell the difference.

Two consequences follow from the value being resolved at compile time:

- `pickJson` throws if it is ever reached at runtime. A kit that hits it was not compiled.
- Editing a picked field afterward leaves the bundle stale. Neither recorded hash changes -- the source did not move, and neither did the bundle -- but the compile records the projection it inlined, so [`rdy verify`](#verifying) names the file and [`rdy run`](#advisory-warnings) warns on it. [`rdy verify --rebuild`](#verifying-by-recompiling) is the exact check, reading the file rather than a record of it.

### TypeScript settings

Kits compile with no `tsconfig.json`. Whatever config sits above a kit is ignored, so the same source compiles to the same bundle in any repository and a published bundle is the one its author built.

Kits are bundled by esbuild, and its defaults apply, with two settings declared:

| Setting                   | Value   |
| ------------------------- | ------- |
| `experimentalDecorators`  | `false` |
| `useDefineForClassFields` | `true`  |

One consequence reaches every kit: `paths` aliases do not resolve. Import by relative path or package specifier. A kit that reaches for an alias fails to compile and is told why, rather than compiling into something that breaks when it runs.

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
| `help [<topic>]` | Show help for a command or a topic               |
| `init`           | Scaffold a starter config and kit                |
| `list`           | List available kits                              |
| `verify`         | Check compiled kits against manifest hashes      |

`rdy help <command>` prints what `rdy <command> --help` prints, and `rdy help <topic>` prints a section of this README. Run `rdy help` for the topics on offer.

### Selecting what runs

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

### Run options

| Option                        | Description                                                           |
| ----------------------------- | --------------------------------------------------------------------- |
| `--from <source>`             | Kit source (see [kit sources](#kit-sources))                          |
| `--file, -f <path>`           | Path to a local kit file                                              |
| `--url <url>`                 | Fetch kit from a URL                                                  |
| `--packages [<name>]`         | Run a kit the config's `packages` list publishes (default: `default`) |
| `--jit`                       | Run from TypeScript source instead of compiled JS                     |
| `--internal`                  | Use the internal kit directory and infix from config                  |
| `--checklists, -c <name,...>` | Filter checklists within the selected kit                             |
| `--json`                      | Output results as JSON                                                |
| `--detail <summary\|full>`    | How much of the JSON report to emit (default: `full`)                 |
| `--diagnose`                  | Report skipped checks whose `check` would have passed                 |
| `--fail-on <severity>`        | Fail on this severity or above                                        |
| `--report-on <severity>`      | Show this severity or above                                           |
| `--quiet`                     | Hide passed checks; incompatible with `--json`                        |

`--quiet` filters by status where `--report-on` filters by severity, so the two compose rather than override. Both keep the parent checks of anything they show, so a failure nested under passing parents stays reachable.

A checklist either filter empties renders no block at all: its summary-table row states the same counts in a column the reader can compare across the run. A block is withheld only where a table will include its row, so a run of one checklist reports its block however little it has to say, and a run that withholds one always ends with the table.

`--diagnose` runs the `check` of every check its own `skip` turned off, and reports the ones that would have passed: a `skip` exists to prevent a wrong failure, and one that suppresses a right pass instead renders as an ordinary white circle that nothing fails. [When a check skips](#when-a-check-skips) holds the judgment this flag cannot decide. It is opt-in because it executes exactly the work a skip was written to avoid, which may reach a network or a registry. What it finds is reported as [advisory warnings](#advisory-warnings), and the statuses, counts, durations, and exit code are those of an undiagnosed run.

A check's own [`quiet`](#checks) is this flag narrowed to that one check, and a kit whose every check declares it renders what `--quiet` renders. It is not `skip`, which reports that the check did not run and why: a quiet check runs, and its pass reaches the count line and the exit code like any other -- only the line is withheld. `--json` is unaffected, so `rdy run --json --detail full` shows a quiet check that passed.

### Global options

| Option                        | Description                    |
| ----------------------------- | ------------------------------ |
| `--style <auto\|plain\|rich>` | Output style (default: `auto`) |
| `--help, -h`                  | Show help for the command      |
| `--version, -V`               | Show the version number        |

### Kit sources

| Source     | Format                    | Example                       |
| ---------- | ------------------------- | ----------------------------- |
| GitHub     | `github:org/repo[@ref]`   | `--from github:acme/ops@v2`   |
| Bitbucket  | `bitbucket:ws/repo[@ref]` | `--from bitbucket:team/ops`   |
| npm        | `npm:<package>`           | `--from npm:@acme/eslint-cfg` |
| Local repo | `<path>`                  | `--from ../other-repo`        |
| Directory  | `dir:<path>`              | `--from dir:/shared/kits`     |
| Global     | `global`                  | `--from global`               |

`@ref` defaults to `main`. Local repo paths look for kits in `<path>/.readyup/kits/`; `dir:` paths are used directly.

`npm:` resolves an installed dependency, so the kit that runs is the one shipped with the version the project has. See [package-hosted kits](#package-hosted-kits).

Private repositories use ambient tokens: `GITHUB_TOKEN` (falling back to `gh auth token`) and `BITBUCKET_TOKEN`. Without a token, requests go anonymous and only public repositories succeed.

### Reading the output

A check line reads `token name <separator> detail [progress] (duration)`. The separator is `·` in `rich` and `-` in `plain`; progress takes brackets. Durations appear from 100 ms up, never on a check that did not run, and always on a tail or total line.

**A failed line states only its claim.** The reason renders beneath it, indented to the name column -- the authored `detail` first, then any thrown exception behind its `Error:` label. Passes and skips keep their detail inline.

**Every block closes with its count line.** A count line is labelled `Total:`, leads with the run's worst severity, and reports counts in a fixed order -- errors, warnings, recommendations, passed, blocked, skipped -- omitting any that is zero, separated by commas. The label is what tells the line from the check lines above it, which lead with a token in the same column. It is the block's last line, following any `Fixes` recap.

**Every block heads itself with a breadcrumb.** A run block is headed `━━`, and its segments read source, then kit, then checklist, separated by a spaced slash. A segment appears only where it distinguishes something: the source where the kit came from anywhere but the local kits directory or the working directory, the kit where the run holds more than one or a source segment is already there, the checklist where the kit runs more than one. A lone local kit running one checklist heads nothing at all. The summary table heads itself at `━━` too, as a peer of the blocks it tallies, and each of its rows repeats the breadcrumb of the block it summarizes, the same segments elided; `Fixes` and each command's own heading stay at `──`, which heads a section and nothing else.

Blank lines separate blocks rather than decorate headings: none opens a command's output, follows a heading, or falls inside a block, and exactly one separates one block from the next, a kit boundary included. More than one checklist anywhere in the run adds a summary table:

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

A kit from an installed package, a repository, or a URL names where it came from, so a long run says which checks belong to which kit without the reader scrolling for it:

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

### Output styles

`--style` selects rendering; `RDY_STYLE` holds a standing preference. The flag outranks the environment variable, which outranks detection.

| Value   | Renders                                                                       |
| ------- | ----------------------------------------------------------------------------- |
| `auto`  | `plain` under CI or when output is not a terminal, `rich` otherwise (default) |
| `plain` | Fixed-width ASCII words                                                       |
| `rich`  | Emoji tokens                                                                  |

`CI` catches a runner that attaches a pseudo-terminal; the terminal check catches an interactive `rdy | grep FAIL`. An explicit `CI=false` is read as a denial. Naming a style that does not exist fails the invocation.

In `plain`, every character is printable ASCII, heading rules and separators included. A role glyph is omitted while keeping its column, so names stay aligned; in a breadcrumb, where there is no column to keep, the spaced separator is what separates one segment from the next:

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

Once a style is named explicitly, output is identical to a terminal or a pipe. `--style` is independent of `--json`: the JSON document never changes.

### Suppressing a finding

A check naming located sites reports each as `path:line`. A source suppresses one with a pragma:

```ts
// rdy-ignore-next-line -- the bootstrap shim, no deps allowed
error instanceof Error ? error.message : String(error);
```

| Token                  | Covers              |
| ---------------------- | ------------------- |
| `rdy-ignore`           | The line it sits on |
| `rdy-ignore-next-line` | The line below it   |

With no argument a pragma covers every check for the line, which is the form to reach for: a kit publishes advice rather than a lint rule, so silencing one reviewed site should cost a comment and nothing more. A trailing `-- <reason>` is optional everywhere and changes nothing about what is suppressed.

One or more comma-separated check ids may follow the token, and the pragma then suppresses for those checks alone:

```ts
// rdy-ignore-next-line toolbelt.errors/no-instanceof-error -- the bootstrap shim, no deps allowed
error instanceof Error ? error.message : String(error);
```

A failed check prints its id bracketed ahead of its fraction, and that printed form is what a pragma writes:

```
❌ No source narrows a thrown value by hand [toolbelt.errors/no-instanceof-error] [2 of 5]
   src/a.ts:4, src/b.ts:9
```

A kit an installed package publishes namespaces its checks under that package's name with the scope stripped, so `@williamthorsen/toolbelt.errors` yields `toolbelt.errors/<id>`. The fully-qualified `@williamthorsen/toolbelt.errors/<id>` is accepted too; the bare id is not, because the namespace is what keeps two kits' same-named checks apart. A kit reached any other way -- from the local kits directory, a `--from` directory, or a URL -- has no namespace, and its bare id stands. An id naming no check in the run suppresses nothing, as does a pragma on a check that declares no id at all.

The id list ends at the first token that is not an id: a `--` reason, the delimiter closing a block comment, a second pragma token, or the line's end. Everything before that is read as ids, so a reason written without `--` names checks rather than explaining the decision: `// rdy-ignore because the API is frozen` suppresses for a check called `because`, and therefore for none. Write a reason behind `--`. Under `--json`, each check entry includes its `id` in both detail projections.

A suppressed finding leaves the audit rather than being downgraded: out of the detail, and out of both halves of the check's fraction, so a project that has settled every remaining site reaches completion rather than resting one short. An unqualified pragma takes the site out of every check's fraction at once, which is what keeps the checks of one run comparable; a qualified one takes it out of the checks it names and leaves it standing in the rest.

The token is read from the source's raw text and matched wherever it appears on the line, so a detector that blanks comments before it scans cannot erase a pragma first, and a line that quotes the token in a string suppresses a finding sited on it.

A pragma that outlives the finding it was written for is reported under [`pragma-unused`](#advisory-warnings), so a site rewritten or a check retired leaves a comment the next run names rather than dead text nobody notices.

### Advisory warnings

`rdy run` raises advisories about the run it is performing. Warnings go to stderr in both modes and appear under `warnings` in JSON; none affects the exit code.

Three compare the kits it is about to run against `.readyup/manifest.json` and say so when they disagree.

| Code           | Raised when                                                              |
| -------------- | ------------------------------------------------------------------------ |
| `input-stale`  | A file the compile inlined changed since the bundle was built from it    |
| `source-stale` | The kit's TypeScript changed since the compiled bundle was built from it |
| `target-drift` | The compiled bundle no longer matches the manifest's recorded hash       |

They are silent when the manifest is absent, when no entry describes the kit, when an entry records no hashes or no input closure, or when a file they would compare is gone or cannot be read. Only the local manifest is consulted, so a kit reached through `--from` is out of scope -- run `rdy verify` in that root instead. They also do not apply to `--url` or `--jit`.

A manifest that is present and cannot be read is the one case that speaks for itself, because all three then go unchecked for every kit in the run.

| Code                  | Raised when                                                           |
| --------------------- | --------------------------------------------------------------------- |
| `manifest-unreadable` | `.readyup/manifest.json` exists but does not parse against the schema |

An absent manifest stays silent: it is the normal state of a project that never compiled, and says nothing about any kit.

Two more come from [`--diagnose`](#run-options), and are raised only where that flag asked for them.

| Code                     | Raised when                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| `diagnosis-inconclusive` | A diagnosed check threw, or returned a value expressing no verdict |
| `skip-masks-pass`        | A check its own `skip` turned off would have passed had it run     |

These read the checks rather than the manifest, so none of the silencing conditions above reaches them: they apply wherever the kit came from, `--url`, `--from`, `--packages`, and `--jit` alike. A check blocked by a failed precondition declared nothing and is not diagnosed.

One compares the readyup that compiled a bundle against the one running it.

| Code           | Raised when                                                      |
| -------------- | ---------------------------------------------------------------- |
| `version-skew` | A bundle was compiled by a newer readyup than the one running it |

Only that direction is reported: the recorded version freezes at publish time while runners move on, so a bundle behind the runner is the ordinary state of a published kit. The advisory stands in for a floor the author never declared, so a kit declaring [`minReadyupVersion`](#kit) never raises it -- a runner below that floor has already failed the load. A bundle recording no version is silent, `--jit` runs from TypeScript source included.

One more reads the sources the run's checks examined and reports the pragmas among them that suppressed nothing.

| Code            | Raised when                                                                        |
| --------------- | ---------------------------------------------------------------------------------- |
| `pragma-unused` | An [`rdy-ignore` pragma](#suppressing-a-finding) suppressed no finding in this run |

The evidence is what the checks read. A pragma is reported only where some check examined the file holding it -- swept it through [`readTrackedSources`](#project-sources), or named it in [`scanned`](#checks) -- and no check of the run suppressed a finding on the line the pragma covers; a pragma in a file no check examined is not reported, because the run established nothing about it. Paths are matched by their resolved form, so a check declaring absolute paths and one reporting relative finding paths agree, and the warning prints the path relative to `cwd`, the form findings print in. One ledger spans the invocation, so a file two kits both examined is scanned once. A diagnosis contributes neither examined paths nor suppressions, the run having turned that check off; a sweep the check read in its own `skip` before returning the reason was recorded when it ran, and stands.

Recognition for the report is stricter than for suppression. A token is a site when it sits in a comment with nothing but whitespace and `*` between it and the `//` or `/*` that opened one, in a JavaScript-family file. A token in a string, in a regular expression, following prose or code inside a comment, or second on its line is not a site. Suppression is unchanged and still matches the raw text of every file type, so the report can only ever withhold a warning, never license a finding.

Two limits follow from that. Recognition reads JavaScript-family syntax, so a pragma in a source of any other kind is never reported. And a pragma written for a check that skipped, was blocked, or was not loaded is reported where any check examined its file, that skipped check's own `skip` included where it swept before skipping: the run holds no evidence the check would have suppressed anything.

### Kit import compatibility

A compiled kit leaves its `readyup` imports unbundled, so it binds whichever readyup runs it rather than the one that built it. Before running a bundle, `rdy run` reads the `readyup` symbols it imports and compares them against what the running readyup exports.

A kit importing a symbol, or a `readyup` subpath, the runner does not export does not run: the failure is a `kit-load` error naming every missing symbol, the kit, and the publishing package where the kit has one, and it exits `2`. Unlike the staleness advisories above, this check is not manifest-derived and applies wherever the kit came from, `--url`, `--from`, and `--packages` included. `--jit` runs load TypeScript source rather than a bundle, and are unaffected.

The remedy follows where the kit is maintained:

| Kit source                     | Remedy                                                  |
| ------------------------------ | ------------------------------------------------------- |
| This project's `.readyup/kits` | Run `rdy compile` to rebuild it                         |
| An installed package           | Upgrade the package to a release built for this readyup |
| A URL or remote repository     | Ask the kit's publisher to recompile it                 |

An import binding no name the runner could be asked for -- a namespace import, a default import, a dynamic import -- has its names left unchecked. Its subpath is still checked, so a namespace import of a subpath readyup does not publish fails like any other.

### Exit codes

| Code | Meaning                                                                                       |
| ---- | --------------------------------------------------------------------------------------------- |
| `0`  | Ran and found no problems                                                                     |
| `1`  | Ran and found problems: failed checks, a kit that fails `verify`, a kit that fails to compile |
| `2`  | Could not complete the invocation: a usage, config, kit-load, or internal error               |

The distinction is "fix the repo" (`1`) versus "fix the invocation" (`2`). `rdy list` and `rdy init` produce only `0` and `2`. A run that loses a kit part-way exits `2` even when the kits that ran found problems, and still reports what it collected.

### Listing kits

```
rdy list                         List internal, compiled, and configured-package kits (owner view)
rdy list --packages              List the kits this project's dependencies publish
rdy list --recursive             List compiled kits in every project below the working directory
rdy list --recursive --packages  List each project's kit-publishing dependencies
rdy list --from <source>         List compiled kits at a local path, remote source, or installed package
rdy list --manifest <path>       List the kits a manifest file declares
```

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

Kits from configured packages get their own section, each named package-first so a kit reads the same here as in the heading `rdy run` gives it, and any installed dependency publishing kits the config omits is named as a candidate:

```
── Packages
   To run: rdy run --packages [<name>]
📦 @acme/eslint-config@2.1.0 / 📓 drift

── Available
   Add to "packages" in the readyup config
📦 @acme/release-kit
```

`--packages` covers the dependency question on its own, and covers it for both groups at once. `rdy list --packages` reports every installed direct dependency that publishes kits, plus every package the config names, one block apiece with the kits it publishes and the descriptions their manifests record:

```
━━ 📦 @acme/eslint-config@2.1.0
   To run: rdy run --packages <name>
📓 drift · Dependency drift

━━ 📦 @acme/release-kit@4.0.1 · not listed in the readyup config
   To run: rdy run --from npm:@acme/release-kit [<name>]
📓 default
📓 npm-auto-publish
```

The hint above each block is what marks the package. A package the config names is headed by `rdy run --packages`, which is exactly the run that would reach it; one the config omits is headed by the source that names it directly, and reads `not listed in the readyup config`. Every kit listed is therefore runnable by the command above it, and learning what an unconfigured package holds no longer means a `--from npm:` listing per package.

Configured packages are resolved through `node_modules` rather than through the project's declared dependencies, so one that is installed without being declared is reported here as it is under a plain `rdy list`; where that misses, a name matching one of the project's own workspaces resolves to that workspace, and a name matching neither warns and is omitted. On its own, `--packages` reads the working directory, and it is not combinable with `--from` or `--manifest`. Pairing it with `--recursive` sweeps the whole repository, which [Listing a repository's dependencies](#listing-a-repositorys-dependencies) covers.

`--manifest` reports each kit's compile-time ReadyUp version and description:

```
── Manifest: .readyup/manifest.json
📓 deploy (readyup v0.22.0) · Pre-deployment checks
📓 smoke (readyup v0.22.0)
```

A local `--from` source with no manifest falls back to listing the compiled kits on disk; those rows have a name and path only. A remote source still requires a manifest.

#### Listing a whole repository

`--recursive` sweeps down from the working directory and reports each project's compiled kits under a heading naming the directory they live in, with the descriptions that project's manifest records:

```
━━ 📁 ./
   To run: rdy run <name>
📓 demo

━━ 📁 packages/readyup/
   To run: rdy run --from packages/readyup [<name>]
📓 default · Authoring hygiene for a project that defines readyup kits
📓 publishing · Publication readiness for a package that ships readyup kits
```

Every listed kit is reachable by the command above it, from wherever the sweep was run. A project that sets a custom `compile.outDir` is reached by file instead, since that is the only resolution path that respects it, and its rows are named by a path that resolves from the sweep root:

```
━━ 📁 packages/tooling/
   To run: rdy run --file <file path>
📓 packages/tooling/dist/kits/lint.js · Shared lint and format gate
```

Internal kits and configured-package kits are absent: no invocation reaches another project's uncompiled sources, and packages are the other axis of discovery rather than this one. A project with nothing compiled is not rendered at all, so a sweep of a repository whose kits are all uncompiled prints `No kit projects found.`

The sweep considers every directory holding a `package.json`, the working directory included, and skips `node_modules` and dot-directories. Each project it finds is read under its own `.config/readyup.config.ts`. Topology comes from the filesystem rather than a workspace file, so the sweep does not care which package manager the repository uses -- but a kit directory with no `package.json` beside it is not a candidate. `--recursive` cannot be combined with `--from` or `--manifest`, which name a single foreign source.

#### Listing a repository's dependencies

`--recursive --packages` is the two axes at once: the locality of the sweep and the provenance of the dependency view. It reports each project's kit-publishing dependencies under the directory that declares them, with the command that runs each package's kits:

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

Every project's dependencies and configured packages are read from its own `package.json` and its own `.config/readyup.config.ts`, so a package one workspace names and another does not reads `not listed in the readyup config` only where it is unnamed. A workspace's own dependency is reachable from nowhere else, so its command includes the `cd` that gets there: `rdy run` takes no directory, and `--from` names a kit source rather than a working directory.

This sweep is wider than the one `--recursive` makes alone. It considers every directory holding a `package.json`, whether or not that directory has a readyup footprint, because a workspace authoring no kits of its own still declares dependencies that publish them -- and that workspace is the one the question is about. A project with no kit-publishing dependency is not rendered at all, its directory line included, and a sweep left with nothing prints `No dependency of any project below this directory publishes kits.`

Unlike every other listing, this view has no heading rules. The two rule weights it would otherwise need are a stroke apart, and the roles they would mark are already told apart by their glyphs; under `--style plain`, where the role glyphs are empty, the indentation marks all three levels on its own. That is also why each command is labelled `To run:`: it shares a column with the kits beneath it, and the label is what keeps it from reading as one more kit.

Rows are keyed by `name`, `kind`, `project`, **and** `origin.package` together. Under the default configuration a compiled source appears twice -- once as `internal` and once as `compiled`. A package's kit is `compiled` like any other bundle, distinguished by the package it records rather than by a kind of its own, so `name` and `kind` alone collide between your kit and a package's kit of the same name; under `--recursive` they collide again between two projects that each hold a `default`, and under `--recursive --packages` between two workspaces depending on the same package. A consumer indexing on less than the full key silently drops a row.

Every kit a package published has `origin.configured`, reporting whether the config names that package and so whether `rdy run --packages` would reach it. It is emitted under `--packages`, under `--recursive --packages`, and under a plain `rdy list` alike, so a consumer never has to know which invocation wrote the payload; it is absent only from a payload written before the field existed. Candidates from the **Available** section are not kits and appear separately in `availablePackages`, which accompanies the owner listing alone: under `--packages` those packages' kits are rows of their own, so there is nothing left to name separately.

### Scaffolding

```
rdy init                       Scaffold a starter config and kit
```

| Option          | Description                           |
| --------------- | ------------------------------------- |
| `--dry-run, -n` | Preview changes without writing files |
| `--force`       | Overwrite existing files              |

## JSON output

`run`, `compile`, `list`, and `verify` accept `--json`; `init` does not. With `--json`, stdout holds exactly one JSON document and every human-readable line goes to stderr. `--help` and `--version` have no JSON form.

### Published schemas

Each payload is specified by a JSON Schema shipped with the package and includes an integer `schemaVersion` matching the `vN` in its filename.

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

- **Adding an optional field does not bump `schemaVersion`.** A validator pinned to `v1` keeps accepting payloads from a later ReadyUp.
- **Removing, renaming, or re-typing a field does bump it**, publishing a new `vN` beside the old. Widening a closed set counts as re-typing.
- **A field is `required` only when every payload has it.** Omission is reserved for absent or empty data.
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

An error entry has no counts and no verdict, and the top-level totals cover only the kits that ran.

An error body may also include `hint`, one action that would clear the failure:

```json
{
  "schemaVersion": 1,
  "error": {
    "code": "config",
    "message": "No manifest found at https://raw.githubusercontent.com/acme/private/HEAD/.readyup/manifest.json.",
    "hint": "If the repository is private, set GITHUB_TOKEN or run `gh auth login`."
  }
}
```

`hint` is optional and absent when nothing useful can be suggested. It never duplicates text already in `message`, so a consumer can present the two separately. Human output renders it on a line of its own, prefixed `💡 Hint:` under the rich style and `Hint:` under plain.

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
      "compiledWith": "0.21.0",
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

- **`passed`** is the run verdict, agreeing with exit code 0 in every case. Kit and checklist entries have their own.
- **`counts`** holds the six tallies at report, kit, and checklist level, nested so count names and verdict names share no namespace.
- **`worstSeverity`** is derived verdict data, omitted when nothing failed.
- **`failOn`** and **`reportOn`** appear at the top level only when the corresponding flag was passed, and on every kit that ran as the value that governed it. See [thresholds](#thresholds) for how each resolves.
- **`compiledWith`** names the readyup that built a kit's bundle. It appears on every kit whose bundle records one, including where that version matches the report's own `readyupVersion`, and is absent for a bundle compiled before readyup recorded it and for a kit run from source under `--jit`. `rdy verify`'s [`rebuildCompiledWith`](#verifying-by-recompiling) reports the same value under a narrower rule, appearing only where it disagrees with the running readyup: that field explains a mismatch, this one records what ran.
- **`warnings`** lists any advisory as `{ code, message, remedy? }`, absent when none was raised.

Payloads are slim by construction: an empty field is omitted rather than emitted as `null`, empty `checks` arrays are dropped, and `fix` appears only on failed checks.

### Detail level

`--detail summary` keeps counts, verdicts, and worst severity but reduces the detail tree to failed checks and their fixes -- the shape an agent needs, at a fraction of the tokens. `--detail full` is the default.

Both projections are described by `report.v1.json`, and the report's own `detail` field names which one was received. Passing `--detail` without `--json`, or to any command other than `run`, is a usage error.

## Publishing kits

The path from source to a consumer:

1. Author `.readyup/kits/<name>.ts`.
2. Run `rdy compile` to bundle it to `<name>.js` and record its hashes in `.readyup/manifest.json`.
3. Commit both the compiled `.js` and the manifest.
4. Consumers run `rdy run --from github:org/repo`, which fetches the bundle the manifest describes.
5. Run `rdy verify` in CI to catch a bundle edited by hand or a source left uncompiled, or `rdy verify --rebuild` to catch a bundle stale in anything the hashes do not record.

A published package can ship its kits instead, so consumers reach them through the dependency they already have rather than through a repository URL. See [package-hosted kits](#package-hosted-kits).

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

#### What a manifest entry records

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

`inputs` is the compile's input closure: every module the bundle inlined past the entry, and every JSON file [`pickJson`](#inlining-json-at-compile-time) projected. A module records the hash of its contents. An inlined JSON file records the hash of the projection that was substituted, with the path specifier that produced it, so an edit to a field the kit did not pick is not staleness.

The closure stops at `node_modules`. A dependency's contents are pinned by the lockfile and read exactly by [`rdy verify --rebuild`](#verifying-by-recompiling), while recording them would size a committed, per-compile-rewritten manifest to the dependency tree rather than to the kit: one `import zod` inlines 79 files.

What the closure leaves out is recorded as versions instead: `esbuildVersion` names the bundler and `bundledDependencies` each inlined package, one entry per package rather than one per file. A package a bundle inlines at two versions at once records both, sorted and comma-separated. `bundledDependencies` is absent for a kit that bundles nothing, so `esbuildVersion` is the marker that an entry has the record at all.

An entry compiled before readyup recorded the closure has no `inputs`; one compiled before the version record has no `esbuildVersion`.

### Package-hosted kits

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

### ReadyUp's own kits

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

| Checklist          | What it asserts                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packaging`        | `files` ships the kit directory, the manifest is present, a kit named `default` exists (at `warn`), and every recorded kit sits in `.readyup/kits` under its own name. |
| `freshness`        | The comparisons `default` makes, at blocking severity: a stale kit publishes checks that no longer describe the package they travel with.                              |
| `self-containment` | Every bundle imports only `node:*`, `readyup`, and `readyup/*` -- the specifiers [`rdy compile`](#compiling) leaves external.                                          |

A package declaring no `files` field passes the first check, because everything ships. That check is a containment test rather than an npm-packlist emulation: a `files` list built from globs or negations needs a `.readyup` entry beside them to satisfy it.

Both kits read the convention layout: `.readyup/manifest.json` and bundles directly under `.readyup/kits`. A project that compiles to a different `outDir` still gets its recorded kits checked for freshness, since those paths come from the manifest, but the checks that count compiled bundles report nothing to do. For a published package the layout is not a convention but a contract, which is what the last `packaging` check enforces: `--from npm:` composes a kit's path from its name, so a bundle recorded anywhere else is listed and then fails to load.

Adding readyup to `packages` in the config is what makes `rdy run --packages` include readyup's `default` kit. `publishing` is not part of that run, by the rule that holds back every kit not named `default`; reach it with `rdy run --packages publishing`, which runs it from each listed package publishing a kit by that name. Until readyup is listed, `rdy list` names it among the dependencies that publish kits, and `rdy list --packages` shows the kits it holds.

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
rdy verify --rebuild           Also recompile each kit and compare it to the committed bundle
```

```
── Verifying kits against .readyup/manifest.json
🔴 deploy
   drift (expected 6f58905a, got eb104f57)
🟢 smoke

1 of 2 kits failed verification.
```

Each kit has three independent verdicts. The compiled output is `ok`, `drift`, `missing`, or `unverified`; the source is `ok`, `stale`, `missing`, or `unverified`; the [recorded inputs](#what-a-manifest-entry-records) are `ok`, `stale`, or `unverified`. `drift` means someone edited the bundle by hand; a stale source means the TypeScript moved on and nobody recompiled; stale inputs mean the same of a module the bundle inlined or a JSON projection it substituted. A kit can be all three at once.

The inputs verdict names every input that failed rather than the first, each on its own line, separating a changed module from a changed inline projection. A projected file that is still present while the fields the kit picked are gone is reported as `unprojectable`, which says something about the kit rather than about the file:

```
🔴 deploy
   input stale: checks/shared.ts (module, expected 6f58905a, got eb104f57)
   input unprojectable: ../../package.json (Path not found in JSON: version)
```

Anything other than `ok` or `unverified` on any axis fails the run. `unverified` does not, since an entry with no recorded hash -- or one compiled before readyup recorded the input closure -- says nothing about whether the kit changed.

Under `--json`, each kit reports `status`, `sourceStatus`, and `inputsStatus`. A `drift` verdict reports `expected` and `actual`; a stale source reports `sourceExpected` and `sourceActual`; stale inputs report `inputFailures`, one entry per input naming its `kind`, `path`, and `reason`, plus whichever of `expected`, `actual`, and `detail` that reason has.

In CI:

```yaml
- run: npx rdy verify
```

`rdy verify` enforces where `rdy run` advises: a stale source fails verification and exits 1, while a run emits a warning and proceeds. A verification tool that refused to run because its own bookkeeping was out of date would be worse than one that ran and said so.

#### Verifying by recompiling

The three verdicts cover what the compile read and recorded as hashes. A bundle is a function of more than that: the bundler's version, the compile options, and the contents of every dependency, none of which the hash verdicts cover, since [the closure stops at `node_modules`](#what-a-manifest-entry-records). A bundle stale in any of them still hashes as `ok`.

`--rebuild` settles the question exactly. It recompiles each kit in memory and compares the result to the committed bundle byte for byte:

```
── Verifying kits against .readyup/manifest.json

🔴 deploy
   rebuild mismatch (rebuilt 8c31f0a2, on disk 6f58905a; esbuild 0.28.1 -> 0.29.0; zod 3.24.1 -> 4.0.0)
🟢 smoke
```

A mismatch names which recorded versions changed, read from what the manifest records: the readyup that compiled the bundle, the esbuild, and each bundled package whose version the rebuild does not reproduce. When every recorded version matches, the mismatch says so, which leaves an edited bundle, a changed input, or dependency content changed without a version bump. The comparison reads the rebuild's own record on both sides, so nothing is resolved from the installed tree, and an entry compiled before the version record renders the bare hashes.

The comparison is against the bundle on disk, never the recorded hash, so the verdict is independent of the manifest's bookkeeping and can contradict it. A bundle that reproduces exactly while its recorded hash does not match says the record is what went wrong, not the kit:

```
🔴 deploy
   drift (expected 6f58905a, got eb104f57)
   rebuild ok
```

The verdict is `ok`, `mismatch`, `failed` (the source no longer compiles), or `missing` (nothing to recompile, or nothing to compare against). Only `ok` passes. There is no `unverified` here: an exactness check that waived the kits it could not reach would establish less than it appears to.

Under `--json`, each kit adds `rebuildStatus`. A `mismatch` reports `rebuildExpected` and `rebuildActual`, plus `rebuildCompiledWith` when the bundle was built by a different readyup, `rebuildEsbuild` (the recorded esbuild against the rebuild's) whenever the entry records one, and `rebuildDependencyChanges` when at least one bundled package's version moved; a `failed` reports `rebuildError`. Without the flag, none of these fields appears.

Three things to know before wiring it into CI: It requires esbuild, which a repository that compiles kits already has. The readyup version forms part of a bundle's hash, so a readyup upgrade makes every kit mismatch until recompiled; an esbuild or dependency upgrade mismatches wherever it changes a bundle, and the mismatch clause names it. And it must not run after a step that recompiles kits, because recompilation would defeat the comparison.

The directory the command runs in is not one of them. The same source in the same package always compiles to the same bundle, so `rdy verify --rebuild` returns the same verdict from anywhere in the repository.

```yaml
- run: npx rdy verify --rebuild
```

## Check utilities

Reusable check functions for common assertions:

```ts
import { fileExists, hasPackageJsonField } from 'readyup/check-utils';
```

Every path a check utility takes resolves against `cwd` unless it is absolute, in which case it names the file itself; `filesExist` applies that rule to `baseDir` too, and an absolute entry in its list outranks the base directory.

### Outcomes

| Function                                  | Returns                                                   |
| ----------------------------------------- | --------------------------------------------------------- |
| `missingFrom(category, expected, actual)` | `CheckOutcome` with fraction progress over any collection |

`missingFrom` is what `filesExist` and `hasJsonFields` are built from. Reach for it directly to count anything else: it passes when nothing is missing, and otherwise names what was, under a fraction of how many were found.

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

| Function                               | Returns                                   |
| -------------------------------------- | ----------------------------------------- |
| `readJsonFile(path)`                   | Parsed object, or `undefined`             |
| `readJsonValue(path, ...keys)`         | Value at a key path within a file         |
| `hasJsonField(path, field, value?)`    | Field exists, optionally matching a value |
| `hasJsonFields(path, fields)`          | `CheckOutcome` over several fields        |
| `projectJsonFile(path, paths)`         | Serialized projection of a JSON file      |
| `describeJsonProjectionFailure(error)` | Why a projection failed, without the path |
| `getJsonValue(obj, ...keys)`           | Value at a key path within an object      |
| `hasJsonValue(obj, ...keys)`           | Key path is present                       |
| `isRecord(value)`                      | Type guard for `Record<string, unknown>`  |

`projectJsonFile` returns what [`pickJson`](#inlining-json-at-compile-time) inlines: the paths it names projected out of the file, serialized. It is the one implementation of that projection, so a check reading an entry's [recorded inputs](#what-a-manifest-entry-records) decides an inlined JSON file the same way the compile that recorded it did. It throws when the file is unreadable, holds invalid JSON, holds something other than an object, or no longer holds a path the specifier names. `describeJsonProjectionFailure` words any of those four for a report, and words them without the file path, so a check that already names the file does not name it twice.

### Package manifests

| Function                                              | Returns                                   |
| ----------------------------------------------------- | ----------------------------------------- |
| `readPackageJson()`                                   | Parsed `package.json`                     |
| `hasPackageJsonField(field, value?)`                  | Field exists, optionally matching a value |
| `hasDevDependency(name)`                              | Dev dependency is declared                |
| `hasMinDevDependencyVersion(name, version, options?)` | Dev dependency meets a minimum            |

`hasMinDevDependencyVersion` compares the floor against the version it reads out of the specifier in `package.json`, so the specifier's protocol can settle the question before any comparison happens. Any `workspace:`-prefixed specifier satisfies any floor, `workspace:^1.2.3` included: it links to the package the repo builds, and a repo that publishes a package is not a consumer of it. A `catalog:` specifier settles nothing on its own and is resolved through `pnpm-workspace.yaml` in the working directory, and the version found there is what the floor is compared against. `catalog:` names the `default` catalog, which pnpm also spells `catalog:default`, and which the file writes as the top-level `catalog:` block or as a `default` block under `catalogs:`; any other `catalog:<name>` selects its own block under `catalogs:`. A specifier the file does not resolve meets no floor, as does one whose catalog entry opens a YAML construct this reader does not follow, such as an alias or a flow mapping. A version reached that way is read the same as a declared one, so a catalog entry of `workspace:*` satisfies any floor in its turn. The version is read from the start of the specifier, past any range operator, so one naming fewer than three segments (`7`, `^6`) is measured rather than skipped; a specifier with its version elsewhere, as the `npm:` alias protocol does, is read for a three-segment version anywhere in it. Pass `options.exempt` to exempt further specifiers; it receives the specifier as written, so a catalogued dependency reaches it as `catalog:` rather than as the version behind it, and it adds to the built-in exemption rather than replacing it.

### Versions and runtime alignment

| Function                             | Returns                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `compareVersions(a, b)`              | Comparison of two semver strings                                                         |
| `readEnginesNodeFloor(manifest)`     | `{ kind: 'found', floor, raw }`, `{ kind: 'absent' }`, or `{ kind: 'unparseable', raw }` |
| `satisfiesNodeFloor(version, floor)` | Whether a runtime meets a floor; `undefined` if either is uncomparable                   |
| `readToolVersionsNode(path?)`        | Node version declared in `.tool-versions`                                                |
| `esYearForNodeMajor(major)`          | ECMAScript year a Node major supports (`24` → `es2025`)                                  |
| `readTsconfigLanguageLevel(path)`    | Effective `lib` and `target`, resolved through `extends`                                 |
| `readTsconfigChain(path)`            | Each config the `extends` chain reaches, and what it declares in its own right           |

Each reader reports only what it can see, so a check composing them decides for itself what each unknown means. `readEnginesNodeFloor` recognizes only forms from which a single floor follows (`>=24`, `^22.1`, `24.1.0`); a union or wildcard comes back `unparseable` rather than an invented floor. `readTsconfigLanguageLevel` resolves `extends` as TypeScript does, following relative paths and published base configs alike; it also returns `chain` (the configs it read) and `unresolvedExtends` (references it could not follow), so a check can tell an incomplete read from an undeclared setting. `readTsconfigChain` reports that same walk one layer down: every config it reached, the `extends` specifier that reached each one, and what each declares in its own right, with values left exactly as written. Reach for it to ask which config declared a setting, or to read a field the language-level reader does not cover, such as `files` or `include`. The specifier is a chain entry's stable identity: a package's path shifts with install layout, resolving under `node_modules/.pnpm/` in one project and under a linked workspace directory in another. Where two `extends` branches reach one config, the entry names the branch that reached it first.

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

| Function                                  | Returns                                        |
| ----------------------------------------- | ---------------------------------------------- |
| `computeHash(content)`                    | Hash of a string or byte sequence              |
| `fileMatchesHash(path, expected)`         | File's hash matches the expected               |
| `hashToRecordedLength(content, recorded)` | Hash truncated to a recorded hash's own length |
| `isRecordedHash(value)`                   | Value is a well-formed recorded hash           |

### Workspaces

`discoverWorkspaces()` returns a uniform `Workspace[]` collapsing pnpm, npm, and yarn monorepo conventions -- and single-workspace repos -- into one iteration shape. Each entry has `dir` (relative to `cwd`; `'.'` for the repo root), `absolutePath`, `name`, `isPackage` (`package.json.private !== true`), `isRoot`, and the parsed `packageJson`.

The repo root is reported in every shape, exactly once, so every call shape is a filter over one list rather than a list a caller adds the root to and dedupes.

```ts
const members = discoverWorkspaces({ filter: (w) => !w.isRoot });
const packages = discoverWorkspaces({ filter: (w) => w.isPackage });
```

`isRoot` is independent of `isPackage`: a monorepo may publish its root, and a member may be private. A root `package.json` that is missing or unparseable throws, whatever the repo's shape.

A kit test that needs a `Workspace` value builds one with `makeWorkspace`; see [Testing a kit](#testing-a-kit).

`pnpm-workspace.yaml` is read by a minimal block-sequence parser; configs using YAML anchors, flow sequences, or negation patterns raise a clear error.

Discovery is memoized per `cwd` for the life of the process: Repeated calls in one run share a single directory walk. `filter` is applied per call rather than being part of the key, so two checks filtering differently share that walk too. Entries are the same `Workspace` objects on every call, frozen along with their `packageJson`, so a write throws rather than reaching the next caller; a workspace added or removed after the first call does not appear in later results. A discovery that throws is not memoized.

### Kit packages

`discoverKitPackages(fromDir?)` names the installed dependencies that publish kits, sorted. It reads the `dependencies` and `devDependencies` a project declares rather than sweeping `node_modules`, so every name it returns is one the reader chose to depend on and can act on; a transitive package is not. `fromDir` defaults to `cwd`, which under `rdy run --from <other-repo>` is the project being checked rather than the repo the kit came from.

```ts
const missing = discoverKitPackages().filter((name) => !configuredPackages.includes(name));
```

It is best effort: a project manifest it cannot read or parse yields `[]`. An empty result therefore does not distinguish a project with no kit-publishing dependencies from one whose manifest could not be read, which a check treating the result as authoritative would report as a pass either way.

### Project sources

| Function                              | Returns                                                        |
| ------------------------------------- | -------------------------------------------------------------- |
| `listTrackedFiles()`                  | Paths git tracks under `cwd`                                   |
| `readTrackedSources(filter?)`         | `{ path, text }` for each tracked path the filter selects      |
| `blankNonCode(text)`                  | The same text with every comment and literal blanked           |
| `getLineAtOffset(text, offset)`       | The 1-based line holding an offset                             |
| `countPackageUsage(sources, options)` | Calls into a package, counted only where the source imports it |
| `buildFindingReport(options)`         | A `FindingOutcome` the runner suppresses, renders, and counts  |

These six are what an adoption kit needs -- one reporting where a project hand-rolls what a package it already installed provides. Both readers return `undefined` outside a git working tree, which an empty list does not say: a project that cannot be swept is a different result from one that was swept and holds nothing.

`listTrackedFiles` lists with `git ls-files -z`. The `-z` is what makes the list complete: without it git escapes a path holding a non-ASCII byte and wraps it in quotes, and that file drops out of the sweep unreported. Below the repo root git emits paths relative to `cwd` and limited to that subtree, the same scope a relative `readFile` path works in. The sweep therefore follows the project `rdy` was invoked in, never the repository a kit was loaded from.

`readTrackedSources` applies its filter before any read, so a caller never pays for a file it excluded, and holds what it read for the life of the process. A file two kits both select costs one read between them, and each pays only for the remainder the other did not ask for. That cache lives here rather than in a kit because a compiled kit leaves its `readyup` imports unbundled, making `check-utils` one module instance across every kit of a run; a cache inside a bundled helper would be one per bundle. Listings are held the same way and are shared by checks that start together, which the runner does. The sweep never reads `node_modules/` or `.readyup/kits/*.js` whatever the filter returns for them -- the latter is readyup's own generated artifact, and sweeping it would report a kit's bundled source back to its author. That kit exclusion names the default `compile.outDir`; a project compiling its kits elsewhere excludes that directory itself. A caller wanting further exclusions applies them in its own filter.

It also reports the paths it returns to the run, which is the evidence a [pragma that suppressed nothing](#advisory-warnings) is judged against, so a check reading the project this way declares no `scanned` of its own and a sweep it reads in `skip` counts as much as one it reads in `check`. `listTrackedFiles` reports nothing, so a check taking that listing and reading the files itself declares `scanned`.

`blankNonCode` is what a detector scans instead of the raw text. It replaces every comment and every literal's text with spaces, so an idiom written in prose is invisible to an anchor scan while the code around the prose is not; a recommendation pointing at a comment is a false positive, and a false positive is what discredits a kit. Literal delimiters survive and only the text between them blanks, because a literal is an operand -- a scan reading the token before a `[` would otherwise take `'abc'[0]` for an array literal -- and an expression interpolated into a template literal stays visible as the code it is. Where a `/` could open a regular expression or divide, the ambiguity resolves toward division, and a quoted string or regular expression whose closing delimiter never arrives on its line was neither, so a misjudgment leaves text standing rather than blanking an expression that runs. That direction holds because a `/` is classified against the operand before it, so every construct completing an operand has to present itself as one: a postfix operator -- `++`, `--`, and TypeScript's `!` -- attaches to its operand rather than replacing it, and a member name keeps the `.` or `#` that introduced it, so a property spelled like a keyword is read as the property it is. `>` is classified the other way, because `=>` obliges it to open a regular expression, so a JSX text node beginning with `/` blanks as far as its closing tag's slash. It reads JavaScript-family syntax; a source in another language yields arbitrary output rather than an error, so a filter selecting `.md` or `.yaml` paths should not reach for it.

`getLineAtOffset` turns an offset into the line `buildFindingReport` renders. The two pair: `blankNonCode` preserves its input's length and every line-break position, so an offset found in the blanked text names the same line in the source a reader opens.

`countPackageUsage` counts calls to the named exports and counts none in a source that never imports the package, from its root or any subpath. The import is what separates adoption from a name collision: a project hand-rolling its own `describeError` calls that name as often as an adopter calls the real one. Its two patterns read two texts -- the call scan reads a blanked source, so a call named in prose is not counted as one made, while the import test locates its match in a source with comments alone blanked, because the specifier it matches is itself a string literal that full blanking would erase, then reads the blanked text at that offset so a source quoting an import is not taken for one making it.

`buildFindingReport` takes every finding the project holds plus a predicate selecting the ones the calling check reports, and returns them as a `FindingOutcome` for the runner to suppress, render, and count. The runner names each reported finding as `symbol (path:line)`, or `path:line` where it declares no symbol, and derives the fraction from every finding passed rather than only the reported ones, so the checks of one run share a denominator the reader can compare across them.

Pass `ownImplementation` -- the package name, the export names, and the swept sources -- and every finding sited in that package's own implementation drops, from the detail and from both halves of the fraction. A declaration qualifies by being exported under one of the named exports from a file inside a workspace whose `package.json` names the package, so the repo publishing an idiom is not told it hand-rolled it. The same doctrine governs `hasMinDevDependencyVersion`: a repo that publishes a package is not a consumer of it. The rule is declaration-scoped, because a workspace is the whole repository in a single-package project, where a workspace-wide rule would turn the check off, and the argument goes one step further: the reasoning reaches the wrapper alone, so a neighbouring declaration in the same file is ordinary code and is still reported. A declaration owns the lines from its own head to the line before the next head, or to the file's last line where it is the last, because a generic constraint's braces and a return-type annotation's both defeat a scan for the closing brace and a span cut short reports the implementation the rule exists to exempt. A re-exporting barrel declares no implementation and holds no exempted lines; a file in the package that declares the name without exporting it is a hand-roll and is still reported. A file that declares the export under another name and renames it on export from a second file is not recognized, which surfaces in the publishing repo itself rather than in a consumer's.

The [`rdy-ignore` pragma](#suppressing-a-finding) is honored by the runner rather than here, which is the layer holding both the check and the provenance a pragma naming that check is matched against. A kit passes nothing for it and recognizes nothing: the pragma is readyup's, so every kit reporting through this path speaks one dialect of it rather than each publishing its own. Give the check an `id` and a consumer can suppress its findings by name.

`undefined` is what a check skips on. Reporting it as a pass would say the project holds no hand-rolled sites, when what happened is that nothing was looked at.

```ts
import { blankNonCode, buildFindingReport, countPackageUsage, readTrackedSources } from 'readyup/check-utils';

function isSource(path: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(path);
}

const check = {
  name: 'No source defines its own description helper',
  // The sweep is cached, so the skip and the check share one pass over the project.
  skip: async () => (await readTrackedSources(isSource)) === undefined && 'The project is not a git working tree',
  check: async () => {
    const sources = (await readTrackedSources(isSource)) ?? [];
    const findings = sources.flatMap((source) => listHandRolledSites(blankNonCode(source.text), source.path));
    const usage = { exportNames: ['describeError'], packageName: '@scope/errors' };
    const adoptedCount = countPackageUsage(sources, usage);

    return buildFindingReport({
      adoptedCount,
      findings,
      ownImplementation: { ...usage, sources },
      shouldReport: (finding) => finding.kind === 'clone',
    });
  },
};
```

## Compatibility

`readyup/check-utils` is the stable, versioned surface for kit-author imports. It follows semver: no breaking changes within a major version.

Compiled kits embed nothing of ReadyUp itself -- the runner satisfies `readyup` and `readyup/*` imports at runtime via its module-resolution hook. Kits are therefore version-coupled to the runner across breaking boundaries: when upgrading across a major, recompile with `rdy compile`.

## License

ISC
