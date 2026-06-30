---
source: '@williamthorsen/nmr@0.15.0'
---

# nmr: agent guidance

This file is managed by `@williamthorsen/nmr`. Do not edit; run `nmr sync-agent-files` to refresh it after an nmr upgrade that changes this guidance.

## Discover scripts by running nmr

Run `nmr` with no command (from the monorepo root or any workspace package) to list every available script, including composite expansions and resolved shell commands. Check this before guessing a script name from another repo: The registry is authoritative.

## Invocation rules

- Use `nmr <command>` for anything nmr provides. Do not use `pnpm run <command>`.
- You can invoke nmr from the monorepo root or any workspace package.

### How to make `nmr` resolvable

`nmr` ships as a workspace bin. The bare `nmr` command works only when your shell can find `<root>/node_modules/.bin/nmr`. Choose one:

- **direnv** (recommended for contributors). With [direnv](https://direnv.net/) installed, the repo's `.envrc` adds `node_modules/.bin` to your `PATH` automatically. From any subdirectory, bare `nmr` works.
- **`pnpm exec nmr <command>`**: Works without setup. pnpm resolves the bin from the workspace root.

Avoid `npx nmr`. Inside git worktrees, `npx` can resolve a different nmr binary from outside the working tree.

## Root vs. workspace context

nmr walks up to find `pnpm-workspace.yaml`, then decides which registry to use based on whether your cwd is inside a workspace package. The same command name (e.g. `build`, `test`, `check:strict`) often exists in both registries with different behavior; the root version typically delegates across all workspaces. Use `-w` to force the root registry from inside a package dir, and `-F <pkg>` to run a single package's script from anywhere.

## Composite scripts

A script value shown in `nmr` output as `[a, b, c]` is a composite: it runs `nmr a && nmr b && nmr c`, stopping at the first failure. Composites can reference other composites.

## `root:*` siblings

Some root scripts (e.g. `lint`, `typecheck`, `test`) expand to `nmr root:X && pnpm --recursive exec nmr X`. The `root:X` variant runs only against root-level files; the plain name runs everywhere. Use `root:X` directly when you want to isolate a failure to the root code.

## Managed build

The default `compile` script runs `nmr-compile`, a standalone bin that esbuild-compiles a package's `src` to `dist/esm`, rewriting `~/` (package-root) import aliases and `.ts`→`.js` specifiers, and skipping work when inputs are unchanged. There is no repo-local build script to maintain; `nmr build` runs `compile` then `generate-typings`. To find or debug the build, look to `nmr-compile`, not a `config/build.ts` in the consuming repo.

## Override behaviors

In `.config/nmr.config.ts` or a package's `package.json`, override values have special semantics:

- `""` (empty string): Skip the script with a "Skipping" message; exit 0.
- `":"`: No-op; exit 0. Prefer this over `""` if your repo enforces non-empty script values.
- Any other string: Runs in place of the default.

## Pre and post hooks

Every `nmr X` invocation auto-wraps as the equivalent of `nmr X:pre && nmr X && nmr X:post`. Hooks are first-class scripts that resolve through the same 3-tier registry (built-in defaults → `.config/nmr.config.ts` → per-package `package.json`). Wrapping is uniform; nested invocations from composite expansion get their own hook treatment. Hook failure short-circuits the chain via shell `&&` semantics, propagating the failing exit code.

Behaviors worth knowing:

- **Silent when absent**: Missing hooks produce no error and no output.
- **Skip overrides apply to hooks**: A hook value of `""` or `":"` is treated the same as not defining the hook. No console message.
- **Skipping the main command skips its hooks**: When `X` is overridden to `""` or `":"`, neither `X:pre` nor `X:post` fires.
- **Recursion guard**: Direct invocation of a hook (e.g., `nmr build:pre`) is treated as a leaf operation. It does NOT itself attempt to resolve `build:pre:pre` or `build:pre:post`.
- **Passthrough args attach only to the main command**: `nmr X --flag value` runs hooks without `--flag value`.

Worked examples:

```ts
// .config/nmr.config.ts — extend `nmr build` with a pre-build compile step
import { defineConfig } from '@williamthorsen/nmr';

export default defineConfig({
  workspaceScripts: {
    'build:pre': 'npx rdy compile',
  },
});
```

```jsonc
// packages/nmr/package.json — re-stamp .agents/nmr/AGENTS.md after every build
{
  "scripts": {
    "build:post": "nmr-sync-agent-files",
  },
}
```

The second example calls the bin directly to sidestep the workspace-vs-root registry distinction.

## Agent-file sync

The presence and version stamp of `.agents/nmr/AGENTS.md` is verified by `check:agent-files`, which is part of the default root `check:strict` composite. If it fails, run `nmr sync-agent-files`.
