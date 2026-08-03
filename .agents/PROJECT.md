# Workshop

@nmr/AGENTS.md

## Overview

A monorepo of open-source utilities. Currently houses `readyup`, a pre-deployment verification CLI; `overlay`, a chezmoi-backed scaffolding tool; and `compositor`, a private content-composition engine under construction.

## Project structure

Packages live under `packages/`:

- **`compositor`** — Content-agnostic engine that resolves declared content across precedence-ordered sources and plans idempotent writes to targets. Private and unreleased; no binary.
- **`overlay`** — Idempotent overlay of a canonical scaffolding file set onto a target directory, backed by chezmoi. Binary: `overlay`.
- **`readyup`** — Pre-deployment verification checks with TypeScript-authored kits, CLI runner, and JSON output. Binary: `rdy` (alias `readyup`).

Key files:

- `.config/nmr.config.ts` — Per-repo nmr script overrides
- `.config/readyup.config.ts` — Readyup compile settings
- `.readyup/kits/` — Kit files (TypeScript sources compiled to self-contained ESM bundles)
- `packages/readyup/vitest.config.ts` — Retained per-package config; pins `RDY_STYLE=rich` so rendering assertions never depend on TTY detection
- `vitest.config.ts` — Vitest projects for packages, built on `@williamthorsen/nmr/vitest`
- `vitest.root.config.ts` — Vitest projects for root-level tests, which exclude every workspace package

## Commands

Use `nmr {command}` for monorepo scripts. Use `pnpm run {script}` only for scripts defined directly in a package's `package.json`.

**Root-level (from repo root):**

- `pnpm install` — Install all dependencies
- `nmr ci` — The code-quality gate CI runs (build + strict checks)
- `nmr prepush` — Everything the remote runs (`nmr ci` plus the dependency audit)
- `nmr check` — Typecheck, format check, lint check, and tests
- `nmr build` — Build all packages
- `nmr test` — Run tests across all packages

**Package-level (from any package directory):**

- `nmr build` — Build current package (compile `src` to `dist/esm`, including `.d.ts`)
- `nmr test` — Run tests for current package
- `nmr test:watch` — Tests in watch mode
- `nmr test:coverage` — Tests with coverage

## Architecture

### Build system

- `nmr-compile` (from `@williamthorsen/nmr`) compiles each package's `src` to `dist/esm`, emitting `.js` and `.d.ts` in one pass; run via `nmr build` (CI) and each package's `prepare` script
- Content-hash caching in `dist/esm/.cache` (written by `nmr-compile`) — skips rebuild when sources haven't changed
- ESM-only output (`type: "module"` in all packages)

### Testing

- Vitest with v8 coverage provider
- Typecheck uses `tsgo` (TypeScript native preview)
- Suites are Vitest projects on an isolation ladder, named for the furthest thing a test reaches and selected by `--project`, not by naming a config file. `nmr test` runs `unit` and `tool`, the two tiers a bare install can run; `nmr test:unit` and `nmr test:tool` run one apiece; `nmr test:all` adds `localhost` and `remote`, which this repo declares but does not use.
- The tier a test file lands in is decided by the infix nearest `.test.ts`: `*.tool.test.ts` reaches a program the environment supplies (a spawned binary, or esbuild through its API). `unit` is the residual and claims every file the named tiers don't, so the filesystem is not a tier boundary — a tmpdir test is a unit test.
- Test files are named `<subject>[.<aspect>].<tier>.test.ts`. The tier tail is mandatory; a bare `*.test.ts` is drift, as is a tail naming anything but a tier. Any token before the tail documents intent: `.app.` covers something about the repo itself, `.wiring.` a seam whose branches unit tests already cover, `.roundtrip.` a value surviving serialization and reparsing. Readyup's suite predates the convention and is migrating under #192.

### Code quality

- Lefthook pre-commit hook auto-formats staged files with Prettier
- ESLint with `@williamthorsen/eslint-config-typescript`; optional strict linting via `@williamthorsen/strict-lint`

## Gotchas

- **Build caching**: `nmr-compile`'s content-hash cache (`dist/esm/.cache`) means a rebuild won't run if only non-source files change. Delete the cache file to force a rebuild.
- **Check caching**: a check that already passed on the current working tree reports a pass without running again. Use `nmr --no-cache {command}` when the run has to produce an artifact rather than an exit status (a fresh `coverage/`), and `nmr clean` to forget every recorded pass.
