# @williamthorsen/overlay

Overlay a canonical set of scaffolding files onto a target directory you do not control, and idempotently converge it: create what is missing, delete what is declared for removal, run normalization scripts, and refuse to silently clobber content it does not own.

Overlay is built on [chezmoi](https://www.chezmoi.io/), whose source-state model fits exactly — `dot_`-encoded filenames, `executable_`/`run_` attributes, and `--source`/`--destination` to drive any source tree into any target. Overlay adds three modes (`--verify`, `--create`, `--force`) computed from a parsed `chezmoi status`, plus one guarantee chezmoi lacks natively: `--create` never overwrites a differing managed file.

## Installation

Overlay shells out to the `chezmoi` binary, which must be on your `PATH`:

```bash
brew install chezmoi
```

Install overlay for personal use via npm or a local link:

```bash
pnpm add -g @williamthorsen/overlay
# or, from a checkout:
pnpm link --global
```

Node 24 or later is required.

chezmoi `2.46.0` or later is required; overlay preflights the version and exits with an actionable error otherwise.

## Usage

```
overlay <source-dir> [target-dir] [--verify|--create|--force] [--json] [--help]
```

- `<source-dir>` — a chezmoi source directory describing the files the target should have.
- `[target-dir]` — the directory to converge (defaults to the current working directory).
- Modes are mutually exclusive; the default is `--verify`.
- `--json` prints the structured result instead of the text report.

### Exit codes

| Code | Meaning                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------- |
| `0`  | Converged / clean.                                                                                      |
| `1`  | Drift (`--verify`) or unresolved conflicts (`--create`).                                                |
| `2`  | Hard error: chezmoi missing or below the minimum version, a `run_` script failed, or invalid arguments. |

Exit `2` is deliberately distinct from drift so callers can tell a real failure apart from "the target has drifted".

## Modes

Each mode is computed from the **second (apply-side) column** of `chezmoi status`, whose codes overlay reads as:

| Status code | Meaning                                       | `--verify`                                              | `--create`                       | `--force`         |
| ----------- | --------------------------------------------- | ------------------------------------------------------- | -------------------------------- | ----------------- |
| `A`         | addition (missing in target)                  | report drift                                            | create                           | create            |
| `D`         | native removal (`.chezmoiremove` / `remove_`) | report drift                                            | delete                           | delete            |
| `M`         | differing managed file                        | report drift                                            | **conflict** (never overwritten) | overwrite         |
| `R`         | `run_` script will run                        | surfaced informationally; **never affects the verdict** | run (live output)                | run (live output) |

`--create` and `--force` differ only in the differing-file (`M`) column: `--create` refuses to overwrite, `--force` overwrites.

### `--verify`

Read-only. Drift is any `A`/`M`/`D` row; overlay exits `1` if any exists, `0` otherwise. Pending `R` scripts are reported as "N script(s) would run" but never make verify fail.

`--verify` confirms **file convergence, not script execution.** It cannot know what a `run_` script would do to the target, so it reports the script as pending and moves on.

**Verify-enforceability guideline:** if you want `--verify` to enforce a deletion, express it as a chezmoi-native removal (`.chezmoiremove` or a `remove_` entry), which surfaces as a `D` row that verify counts as drift. Reserve `run_` scripts for imperative normalization that has no static target-state for verify to check.

### Why overlay does not use `chezmoi verify` directly

Overlay runs every chezmoi invocation with a **throwaway `--persistent-state`** (a temp file discarded after each run). Because chezmoi keeps no memory across runs, it always believes `run_once_` / `run_onchange_` scripts are still pending — so `chezmoi verify` exits non-zero on a fully file-converged target. Overlay therefore parses `chezmoi status` itself and ignores the `R` rows for the verdict, which is the only way to get a clean verify on a converged target.

### `--create`

Creates missing entries (`A`), performs native removals (`D`), runs `run_` scripts (`R`), and reports differing files (`M`) as conflicts that are **never written**. The fix-it hint suggests re-running with `--force` to overwrite.

Mechanically, overlay applies only the `A`/`D` entries by **absolute target path** (`chezmoi apply --include=files,dirs,remove -- <abs paths>`), skipping that apply entirely when no `A`/`D` entries exist — a bare apply would converge every file and clobber the `M` entries the mode exists to protect. Scripts then run in a separate `--include=scripts` pass.

### `--force`

A full `chezmoi apply`: overwrite differing files, perform removals, run scripts. `conflicts` is always `0`.

## How script results are surfaced

Under `--create` / `--force`, `run_` script stdout and stderr stream **live to overlay's stderr** — keeping overlay's stdout clean for the text report or `--json`. `OverlayResult.scripts` records `{ ran, ok }`. A script that exits non-zero aborts chezmoi's apply; overlay maps that to exit `2` and surfaces chezmoi's diagnostic. chezmoi provides no per-script structured output, so overlay does not invent any.

## Idempotency contract

Because each invocation uses a throwaway persistent-state, chezmoi keeps no cross-run memory: `run_once_` / `run_onchange_` scripts effectively run on **every** `--create` / `--force`. Source `run_` scripts must therefore be **idempotent**. This is intentional — it keeps runs isolated, pollutes no host state, and behaves predictably across targets.

## Source-state filename grammar

Overlay uses chezmoi-native source-state filenames: `dot_` (a leading dot), `executable_` (executable bit), and `run_` (scripts, including `run_once_` / `run_onchange_` / `run_before_` / `run_after_`). Symlink overlays (`symlink_`) are deferred to a future `--link`.

## Programmatic use

The CLI is a thin shell over an importable core:

```ts
import { overlay } from '@williamthorsen/overlay';

const result = await overlay({ source: './scaffold', target: './repo', mode: 'create' });
// result: { mode, entries, scripts, counts, exitCode }
```

`overlay(options)` returns a structured `OverlayResult` — never printed text — so other TypeScript code can compose with it.
