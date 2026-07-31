# Workshop

@nmr/AGENTS.md

## Overview

A monorepo of open-source utilities. Currently houses `readyup`, a pre-deployment verification CLI, and `overlay`, a chezmoi-backed scaffolding tool.

## Project structure

Packages live under `packages/`:

- **`overlay`** — Idempotent overlay of a canonical scaffolding file set onto a target directory, backed by chezmoi. Binary: `overlay`.
- **`readyup`** — Pre-deployment verification checks with TypeScript-authored kits, CLI runner, and JSON output. Binary: `rdy` (alias `readyup`).

Key files:

- `.config/nmr.config.ts` — Per-repo nmr script overrides
- `.config/readyup.config.ts` — Readyup compile settings
- `.readyup/kits/` — Kit files (TypeScript sources compiled to self-contained ESM bundles)
- `vitest.config.ts` — Vitest projects for packages, built on `@williamthorsen/nmr/vitest`
- `vitest.root.config.ts` — Vitest projects for root-level tests, which exclude every workspace package

## Commands

Use `nmr {command}` for monorepo scripts. Use `pnpm run {script}` only for scripts defined directly in a package's `package.json`.

**Root-level (from repo root):**

- `pnpm install` — Install all dependencies
- `nmr ci` — Full CI pipeline (strict checks + build)
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
- Suites are Vitest projects, selected by `--project`, not by naming a config file. `nmr test` runs `app` and `unit`; `nmr test:integration` runs `integration`; `nmr test:all` runs all three.
- The project a test file lands in is decided by its suffix: `*.int.test.ts` is integration, `*.app.test.ts` is tooling and drift. `unit` is defined by subtracting those two rather than by an allow-list, so a file with any other suffix — or none — is a unit test and needs no rename.

### Code quality

- Lefthook pre-commit hook auto-formats staged files with Prettier
- ESLint with `@williamthorsen/eslint-config-typescript`; optional strict linting via `@williamthorsen/strict-lint`

## Gotchas

- **Build caching**: `nmr-compile`'s content-hash cache (`dist/esm/.cache`) means a rebuild won't run if only non-source files change. Delete the cache file to force a rebuild.
