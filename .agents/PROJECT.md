# Workshop

@nmr/AGENTS.md

## Overview

A monorepo of open-source utilities. Currently houses `readyup`, a pre-deployment verification CLI.

## Project structure

Packages live under `packages/`:

- **`readyup`** — Pre-deployment verification checks with TypeScript-authored kits, CLI runner, and JSON output. Binary: `rdy` (alias `readyup`).

Key files:

- `.config/nmr.config.ts` — Per-repo nmr script overrides
- `.config/readyup.config.ts` — Readyup compile settings
- `.readyup/kits/` — Kit files (TypeScript sources compiled to self-contained ESM bundles)
- `config/vitest.config.ts` — Shared Vitest base configuration

## Commands

Use `nmr {command}` for monorepo scripts. Use `pnpm run {script}` only for scripts defined directly in a package's `package.json`.

**Root-level (from repo root):**

- `pnpm install` — Install all dependencies
- `nmr ci` — Full CI pipeline (strict checks + build)
- `nmr check` — Typecheck, format check, lint check, and tests
- `nmr build` — Build all packages
- `nmr test` — Run tests across all packages

**Package-level (from any package directory):**

- `nmr build` — Build current package (compile + generate typings)
- `nmr test` — Run tests for current package
- `nmr test:watch` — Tests in watch mode
- `nmr test:coverage` — Tests with coverage

## Architecture

### Build system

- `nmr-compile` (from `@williamthorsen/nmr`) esbuild-compiles each package's `src` to `dist/esm`; run via `nmr build` (CI) and each package's `prepare` script
- Content-hash caching in `dist/esm/.cache` (written by `nmr-compile`) — skips rebuild when sources haven't changed
- Each package also generates `.d.ts` typings via `tsc --project tsconfig.generate-typings.json`
- ESM-only output (`type: "module"` in all packages)

### Testing

- Vitest with v8 coverage provider
- Typecheck uses `tsgo` (TypeScript native preview)

### Code quality

- Lefthook pre-commit hook auto-formats staged files with Prettier
- ESLint with `@williamthorsen/eslint-config-typescript`; optional strict linting via `@williamthorsen/strict-lint`

## Gotchas

- **Build caching**: `nmr-compile`'s content-hash cache (`dist/esm/.cache`) means a rebuild won't run if only non-source files change. Delete the cache file to force a rebuild.
