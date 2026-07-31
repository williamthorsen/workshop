---
source: '@williamthorsen/nmr@0.21.0'
---

# nmr: agent guidance (generated; do not edit)

- Use `nmr <command>`, not `pnpm run <command>`, for anything nmr provides. Run bare `nmr` to list every command and the shell command it resolves to; a wrong guess reports only `Unknown command`, with no list.
- Scope follows cwd, and bare `nmr` lists both registries: from the repo root a command covers root files and every workspace; from inside a package, that package alone. `nmr -F <pkg> <command>` targets one package from anywhere; `nmr root:<command>` targets root files alone, which isolates a failure to root code.
- Never `npx nmr`: inside a git worktree it can resolve a different nmr from outside the tree. Fall back to `pnpm exec nmr`.
- The rest is in `node_modules/@williamthorsen/nmr/README.md`: pre/post hooks (every `nmr X` auto-wraps as `nmr X:pre && nmr X && nmr X:post`), script overrides and their `""`/`":"` skip values, `nmr upgrade` ceilings (report-only until `nmr upgrade --write`), and the `nmr-compile` build (there is no repo-local build script).
