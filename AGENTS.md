# Workshop

## Overview

A monorepo of open-source utilities. Currently houses `readyup`, a pre-deployment verification CLI; `overlay`, a chezmoi-backed scaffolding tool; and `compositor`, a private content-composition engine under construction.

## Project structure

Packages live under `packages/`:

- **`compositor`**: Content-agnostic engine that resolves declared content across precedence-ordered sources and plans idempotent writes to targets. Private and unreleased; no binary.
- **`overlay`**: Idempotent overlay of a canonical scaffolding file set onto a target directory, backed by chezmoi. Binary: `overlay`.
- **`readyup`**: Pre-deployment verification checks with TypeScript-authored kits, CLI runner, and JSON output. Binary: `rdy` (alias `readyup`).

Key files:

- `.config/nmr.config.ts`: Per-repo nmr script overrides. Its root hooks are what keep kit bundles honest, and its `rdy` devBin runs readyup from TypeScript source so the root's `rdy` hooks need no prior build.
- `.config/readyup.config.ts`: Readyup compile settings, plus the `packages` list whose kits audit this repo.
- `.readyup/kits/`: Kit files (TypeScript sources compiled to self-contained ESM bundles).
- `packages/readyup/vitest.config.ts`: Retained per-package config; pins `RDY_STYLE=rich` so rendering assertions never depend on TTY detection.
- `pnpm-workspace.yaml`: Its `catalog` block is the single declaration site for every version shared across manifests, so a package it names is declared as `catalog:` rather than a literal version. Nothing enforces this yet; node-monorepo-tools#654 tracks the check.
- `vitest.config.ts` and `vitest.root.config.ts`: Vitest projects for packages and for root-level tests respectively; the root variant excludes every workspace package.

## Commands

From the repo root, `pnpm exec rdy run --packages` runs the default kit of every package `.config/readyup.config.ts` names, auditing this repo against the conventions those packages own, including `codeassembly`'s `guidance` checklist over the agent-guidance wiring. Nothing in CI runs it; run it by hand after a dependency upgrade.

## Architecture

### Testing

- Suites are Vitest projects on an isolation ladder, named for the furthest thing a test reaches and selected by `--project`, not by naming a config file. `nmr test` runs `unit` and `tool`, the two tiers a bare install can run; `nmr test:unit` and `nmr test:tool` run one apiece; `nmr test:all` adds `localhost` and `remote`, which this repo declares but does not use.
- The tier a test file lands in is decided by the infix nearest `.test.ts`: `*.tool.test.ts` reaches a program the environment supplies (a spawned binary, or esbuild through its API). `unit` is the residual and claims every file the named tiers don't, so the filesystem is not a tier boundary; a tmpdir test is a unit test.
- Test files are named `<subject>[.<aspect>].<tier>.test.ts`. The tier tail is mandatory; a bare `*.test.ts` is drift, as is a tail naming anything but a tier. Any token before the tail documents intent: `.app.` covers something about the repo itself, `.wiring.` a seam whose branches unit tests already cover, `.roundtrip.` a value surviving serialization and reparsing. The root suite's `test-tier-infixes` test enforces the tail across every package.

### Code quality

Lefthook's pre-commit hook formats staged files with Prettier and restages them, so a commit can carry bytes you did not write.

## Commit conventions

The scope values this repo uses are `compositor`, `overlay`, `readyup`, and `root`, mirroring the `scope:*` labels in `.config/release-kit.config.ts`.

## Releases

Releases run through the **Release** GitHub Actions workflow (`workflow_dispatch`), which bumps versions, regenerates CHANGELOGs, and pushes tags; the resulting `<workspace>-v<semver>` tag pushes trigger **Publish** and **Create GitHub Release**. Never push a release tag by hand.

## Gotchas

- **Build caching**: `nmr build` skips a package whose sources are unchanged, keyed on a hash under `node_modules/.cache/nmr-compile/`. This is not the check-result cache, and `--no-cache` does not reach it; removing the output is what forces a rebuild (`nmr clean`, or deleting `dist` by any means).
- **Kit freshness**: the tracked kit bundles embed the readyup version that compiled them, and the manifest records the compile's toolchain (`esbuildVersion`, `bundledDependencies`), so a bump to readyup, to esbuild, or to a bundled dependency leaves them stale until `rdy compile` runs. `nmr ci` verifies them by recompiling, and does so before its build step, which would otherwise regenerate a stale bundle in place.
