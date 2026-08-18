---
slug: readyup-kits
description: 'Authoring judgment for ReadyUp kits: when a check should skip rather than pass, which structures collapse a group of skips, and when a fix getter is appropriate. Consult before writing or editing a readyup kit.'
delivery: skill
---

# Authoring ReadyUp kits

Judgment the kit schema cannot enforce. `node_modules/readyup/README.md` is the reference for everything mechanical: field signatures, statuses, thresholds, preconditions, and the check utilities.

## When a check skips

A skip reports that the check does not apply to this repo. Ask first whether the thing being checked is yours to assert about; only then ask what `check` would have returned.

- If `check` would have failed, and failing would misjudge a conformant repo, the skip is correct.
- If `check` would have passed, delete the skip and let the check pass.

The second question is a fast check, not the rule. A skip is correct whenever the subject is not yours to assert about, whatever `check` would have returned.

| Check                                             | In the skipped state, `check` would     | Verdict                                                |
| ------------------------------------------------- | --------------------------------------- | ------------------------------------------------------ |
| `eslint >= 10.0.0`                                | fail -- no version to satisfy the floor | the skip prevents a wrong failure                      |
| `.config/git-cliff.toml matches current template` | fail -- hash of a missing file          | the skip prevents a wrong failure                      |
| `audit-ci configs are under .config/audit-ci/`    | pass                                    | the skip masks a pass, in every passing state          |
| `code-quality workflow does not use nmr prepush`  | pass                                    | the skip masks a pass                                  |
| `.github/labels.yaml exists`                      | pass                                    | the skip is correct; release-kit does not own the file |

The last row is the one the fast check alone gets wrong. `.github/labels.yaml` is a filename several label-sync tools write, and release-kit generates it only from a `repoLabels` block, so a repo carrying that file without the block would have passed `fileExists` and still deserves the skip.

The third row is the failure mode to watch for: `skip` and `check` ran the identical predicate, so the check could never pass.

`rdy run --diagnose` decides the mechanical half. It runs the `check` of every check its own `skip` turned off and reports the ones that would have passed. It decides nothing about applicability.

## Structuring a group of skips

Only a skipping parent collapses a group. A parent whose `skip` fires reports alone: its descendants are not run, not reported, and not counted.

A parent that _fails_ instead renders every descendant as its own 🚫, which is N blocked lines where one skipped line was wanted. `quiet` helps with neither, suppressing passes only.

To make a whole checklist inapplicable, nest its checks under one parent check whose `skip` returns a reason. A checklist's `preconditions` do not serve here, because a precondition that skips does not gate.

## Reading a run

⚪ means the check declined to apply. 🚫 means the check never ran.

A blocked subtree does not consult a descendant's own `skip`, so a check that would have reported "does not apply" renders as blocked instead. Read a 🚫 as evidence about an ancestor, never about the thing the blocked check names.

## Writing `fix`

Prefer a plain string. Outcome-specific remediation belongs in `detail`, which the check returns after running and can therefore name what actually went wrong.

A getter serves one purpose: reaching a value declared below the kit literal. Keep it pure. A `fix` resolves only where a failure renders it, so an impure getter no longer breaks kit load, but it still buys a subprocess or a registry call for a remediation string.
