# Authoring kits

All helpers are type-safe identity functions that provide editor autocomplete without runtime overhead. Import them from `readyup`.

| Helper                     | Defines             |
| -------------------------- | ------------------- |
| `defineRdyConfig`          | Repo-level config   |
| `defineRdyKit`             | Kit                 |
| `defineRdyChecklist`       | Flat checklist      |
| `defineRdyStagedChecklist` | Staged checklist    |
| `defineChecklists`         | Array of checklists |

## Config

Repo-level settings live in `.config/readyup.config.ts`.

| Key               | Default         | Meaning                                                       |
| ----------------- | --------------- | ------------------------------------------------------------- |
| `compile.srcDir`  | `.readyup/kits` | Directory `rdy compile` reads sources from                    |
| `compile.outDir`  | `.readyup/kits` | Directory it writes bundles to                                |
| `compile.include` | all `.ts` files | Glob limiting which sources a sweep compiles                  |
| `internal.dir`    | `.`             | Directory holding internal sources, relative to the kits root |
| `internal.infix`  | none            | Filename segment marking a file as internal                   |
| `packages`        | none            | Packages `rdy run --packages` runs a published kit from       |

See [internal kits](publishing-kits.md#internal-kits) for what the `internal` keys select, and [package-hosted kits](publishing-kits.md#package-hosted-kits) for `packages`.

## Kit

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

A kit declaring `minReadyupVersion` fails to load on a runner below it. A kit declaring none falls back to an advisory floor, the version its bundle records at compile time, which a lower runner reports as a [`version-skew`](running-checks.md#advisory-warnings) warning rather than a failure.

## Checklists

| Field           | Type                | Default            | Meaning                                     |
| --------------- | ------------------- | ------------------ | ------------------------------------------- |
| `name`          | `string`            | required           | Display name                                |
| `checks`        | `RdyCheck[]`        | required if flat   | Checks, run concurrently (flat checklist)   |
| `groups`        | `RdyCheck[][]`      | required if staged | Groups, run sequentially (staged checklist) |
| `preconditions` | `RdyCheck[]`        | --                 | Gating checks                               |
| `fixLocation`   | `'inline' \| 'end'` | the kit's setting  | Overrides the kit's setting                 |

A checklist has either `checks` or `groups`, never both.

## Checks

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

`reported` marks the sites this check names; the rest count toward the fraction and do nothing else. The runner drops the sites a [pragma suppresses](running-checks.md#suppressing-a-finding), renders the reported survivors as the `detail`, reads `ok` off whether any survived, and counts every survivor into the fraction. `buildFindingReport` builds one of these for the common case; see [project sources](check-utils.md#project-sources).

`scanned` is the escape hatch, not the usual path. A sweep read through [`readTrackedSources`](check-utils.md#project-sources) is recorded on its own, in `skip` and in `check` alike, so a check reading the project that way declares nothing and its files are still evidence for the [pragma that suppressed nothing](running-checks.md#advisory-warnings). Declare `scanned` where the check reads files another way -- shelling out to a tool, walking `listTrackedFiles` and reading them itself, or reaching for `fs` directly -- because nothing else can see what those read.

## Naming checks

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

## The detail contract

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

## When a check skips

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

The third row is the failure mode to watch for: `skip` and `check` ran the identical predicate, so the check could never pass. [`rdy run --diagnose`](running-checks.md#run-options) decides that mechanical half, reporting every check its own `skip` turned off that would have passed. It decides nothing about applicability.

**Only a skipping parent collapses a group.** A parent whose `skip` fires reports alone: its descendants are not run, not reported, and not counted. A parent that _fails_ instead renders every descendant as its own 🚫, which is one blocked line per descendant where one skipped line was wanted. `quiet` helps with neither, suppressing passes only.

**⚪ and 🚫 read differently.** ⚪ means the check does not apply; 🚫 means it never ran, because an ancestor failed or a [precondition](#preconditions) gated it. A blocked subtree does not consult a descendant's own `skip`, so a check that would have reported "does not apply" renders as blocked instead. Read a 🚫 as evidence about an ancestor, never about the thing the blocked check names.

**Prefer a plain-string `fix`.** Outcome-specific remediation belongs in `detail`, which the check returns after running and can therefore name what actually went wrong. A [getter](#validation) serves one purpose: reaching a value declared below the kit literal.

## Agent guidance

The doctrine above ships as agent guidance too, in a CodeAssembly content root under `agents/` in the installed package. A repo that names `readyup` under `packages` in its `.agents/codeassembly.yaml` and runs `codeassembly sync` gets it as the `consult-readyup-kits` skill, in every harness that repo targets.

The skill holds the judgment that a kit author needs while writing; these doc files stay the reference for everything mechanical.

## Staged checklists

A staged checklist replaces `checks` with `groups`. Groups run in order; checks within a group run concurrently.

```ts
import { defineRdyStagedChecklist } from 'readyup';

export default defineRdyStagedChecklist({
  name: 'release',
  groups: [[{ name: 'Working tree is clean', check: () => true }], [{ name: 'Tests pass', check: () => true }]],
});
```

A failure at or above the [failure threshold](concepts.md#thresholds) stops the groups after it; a below-threshold failure is reported and the next group still runs. Only top-level results gate: a failing _nested_ check does not halt the next group.

This is the one gate that consults the threshold. A failed check blocks its own descendants, and a failed precondition gates its checklist, whatever the severity.

## Preconditions

A checklist's `preconditions` gate the checks that follow. If any precondition fails, every check is skipped and each records `precondition` as its reason.

- **A failed precondition gates regardless of severity.** Severity decides whether the run fails; the gate decides whether the checks are worth running. Unlike a staged checklist's groups, the gate does not consult the [failure threshold](concepts.md#thresholds).
- **A precondition skipped `n/a` does not gate.** To make a whole checklist inapplicable, nest its checks under one parent check whose `skip` returns a reason. [When a check skips](#when-a-check-skips) covers why that structure and not a failing parent.

## Suites

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

## Validation

Neither `rdy compile` nor `rdy run --jit` type-checks the kit it loads, so both validate structure at load time, identically -- `rdy compile` refuses to publish a kit that `rdy run` would reject.

Every check is validated wherever it appears: in `checks`, in `groups`, in `preconditions`, and nested. A check needs a non-empty `name` and a `check` function; `severity` must be a valid value; `skip` must be a function, and a `fix` written as a data property must be a string. Unknown keys are allowed, so a kit written for a later ReadyUp still loads.

```
Invalid kit at .readyup/kits/default.js:
  checklists[0].checks[1].severity: expected one of "error", "warn", "recommend", got "info"
  checklists[0].checks[2].check: expected a function, got string
```

A typo'd `severity` is the mistake this matters most for: an unrecognized value would otherwise exclude the check from both thresholds, and the run would pass.

A `fix` written as a getter is the half of `fix` validation that is deferred. Load leaves it unread, and the check that fails resolves it -- so a getter may reference a constant declared below the kit literal, and a check that passes, skips, or is blocked never invokes it. A getter that throws or yields a non-string is reported as `Unresolvable fix: ...` in that failure's remediation slot, rather than as a load error taking the whole kit down.

## Testing a kit

A kit's checks are ordinary functions, and the shape of the test follows what a check reads.

**A check that calls `discoverWorkspaces` itself** is tested against a real directory tree, with `cwd` pointed at it. Nothing is mocked, so the check sees the workspace list discovery actually produces, root included:

```ts
import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { pointCwdAt } from '@williamthorsen/toolbelt.testing/candidate';

it('passes when every package README contains the marker', () => {
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

## Inlining JSON at compile time

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
- Editing a picked field afterward leaves the bundle stale. Neither recorded hash changes -- the source did not move, and neither did the bundle -- but the compile records the projection it inlined, so [`rdy verify`](publishing-kits.md#verifying) names the file and [`rdy run`](running-checks.md#advisory-warnings) warns on it. [`rdy verify --rebuild`](publishing-kits.md#verifying-by-recompiling) is the exact check, reading the file rather than a record of it.

## TypeScript settings

Kits compile with no `tsconfig.json`. Whatever config sits above a kit is ignored, so the same source compiles to the same bundle in any repository and a published bundle is the one its author built.

Kits are bundled by esbuild, and its defaults apply, with two settings declared:

| Setting                   | Value   |
| ------------------------- | ------- |
| `experimentalDecorators`  | `false` |
| `useDefineForClassFields` | `true`  |

One consequence reaches every kit: `paths` aliases do not resolve. Import by relative path or package specifier. A kit that reaches for an alias fails to compile and is told why, rather than compiling into something that breaks when it runs.
