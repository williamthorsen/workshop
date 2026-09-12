# Concepts

## Kits, checklists, and checks

A **kit** is a file exporting one or more **checklists**. A checklist contains **checks**, and a check may nest further checks beneath it. A check that fails blocks its descendants.

```
kit
└── checklist
    └── check
        └── check
```

## Severities

Every check has a severity. It decides whether a failure fails the run and whether the result is reported, and it never decides whether that check itself runs. It affects later work in one case only: A failed check at or above the failure threshold stops the remaining groups of a [staged checklist](authoring-kits.md#staged-checklists).

| Severity    | Meaning           |
| ----------- | ----------------- |
| `error`     | Must be fixed     |
| `warn`      | Should be fixed   |
| `recommend` | Worth considering |

## Statuses

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

Role glyphs are nouns rather than statuses. They name what something is, in a heading segment or beside a listed row, and plain style renders none of them: Position shows the meaning instead.

| Rich | Names                                                  |
| ---- | ------------------------------------------------------ |
| 📄   | a kit's TypeScript source                              |
| 📓   | a kit                                                  |
| 📋   | a checklist                                            |
| 📦   | the npm package in which a kit was published           |
| 🌐   | a kit fetched from `github:`, `bitbucket:`, or `--url` |
| 📁   | a directory from which a kit was read                  |

## Thresholds

Two thresholds govern a run, each resolved as **CLI flag, then the kit's own field, then the default**.

| Threshold | Field / flag               | Default     | Governs                                |
| --------- | -------------------------- | ----------- | -------------------------------------- |
| Failure   | `failOn` / `--fail-on`     | `error`     | Whether a failure fails the run        |
| Reporting | `reportOn` / `--report-on` | `recommend` | Whether a result appears in the output |

A check with no `severity` takes the kit's `defaultSeverity`, which itself defaults to `error`.

Reporting prunes the detail tree only. Summary counts, worst severity, and the exit code always reflect the whole run.
