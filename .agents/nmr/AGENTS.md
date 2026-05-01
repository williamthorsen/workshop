---
source: '@williamthorsen/nmr@0.12.1'
---

# nmr: agent guidance

This file is managed by `@williamthorsen/nmr`. Do not edit — re-run `pnpm exec nmr sync-agent-files` after an nmr upgrade to refresh it.

## Discover scripts by running nmr

Run `nmr` with no command (from the monorepo root or any workspace package) to list every available script, including composite expansions and resolved shell commands. Check this before guessing a script name from another repo — the registry is authoritative.

## Invocation rules

- Use `nmr <command>` for anything nmr provides. Do not use `pnpm run <command>`.
- Use `pnpm exec nmr`, not `npx nmr`. Inside git worktrees, `npx` can resolve a different nmr binary from outside the working tree.
- If `nmr` itself fails to run (fresh clone, missing build output), run `pnpm run bootstrap` from the repo root first.

## Root vs. workspace context

nmr walks up to find `pnpm-workspace.yaml`, then decides which registry to use based on whether your cwd is inside a workspace package. The same command name (e.g. `build`, `test`, `check:strict`) often exists in both registries with different behavior — the root version typically delegates across all workspaces. Use `-w` to force the root registry from inside a package dir, and `-F <pkg>` to run a single package's script from anywhere.

## Composite scripts

A script value shown in `nmr` output as `[a, b, c]` is a composite: it runs `nmr a && nmr b && nmr c`, stopping at the first failure. Composites can reference other composites.

## `root:*` siblings

Some root scripts (e.g. `lint`, `typecheck`, `test`) expand to `nmr root:X && pnpm --recursive exec nmr X`. The `root:X` variant runs only against root-level files; the plain name runs everywhere. Use `root:X` directly when you want to isolate a failure to the root code.

## Override behaviors

In `.config/nmr.config.ts` or a package's `package.json`, override values have special semantics:

- `""` (empty string) — skip the script with a "Skipping" message; exit 0.
- `":"` — no-op; exit 0. Prefer this over `""` if your repo enforces non-empty script values.
- Any other string — runs in place of the default.

## Agent-file sync

The presence and version stamp of `.agents/nmr/AGENTS.md` is verified by `check:agent-files`, which is part of the default root `check:strict` composite. If it fails, run `nmr sync-agent-files`.
