# readyup

Run pre-deployment verification checks against your environment and configuration. Define checklists in TypeScript kits, run them locally or from a remote source, and get clear pass/fail reporting with remediation hints.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add -D readyup
```

Node 24 or later is required, for the runner and for the kits it compiles.

## Quick start

Scaffold a starter config and kit:

```bash
rdy init
```

This creates two files:

**`.config/readyup.config.ts`** — repo-level settings:

```ts
import { defineRdyConfig } from 'readyup';

export default defineRdyConfig({
  compile: {
    srcDir: '.readyup/kits',
    outDir: '.readyup/kits',
  },
});
```

**`.readyup/kits/default.ts`** — starter kit:

```ts
import { defineRdyKit } from 'readyup';

export default defineRdyKit({
  checklists: [
    {
      name: 'deploy',
      checks: [
        {
          name: 'environment variables set',
          check: () => Boolean(process.env['NODE_ENV']),
          fix: 'Set NODE_ENV before deploying',
        },
      ],
    },
  ],
});
```

Run the checks:

```bash
rdy run
```

## CLI reference

```
rdy [names...] [options]
rdy <command> [options]
```

### Commands

| Command          | Description                                      |
| ---------------- | ------------------------------------------------ |
| `run [names...]` | Run checklists (default)                         |
| `compile [file]` | Bundle TypeScript kit(s) into self-contained ESM |
| `init`           | Scaffold a starter config and kit                |
| `list`           | List available kits                              |
| `verify`         | Check compiled kits against manifest hashes      |

### Run options

| Option                        | Description                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| `--from <source>`             | Kit source (see [kit sources](#kit-sources) below)            |
| `--file, -f <path>`           | Path to a local kit file                                      |
| `--url <url>`                 | Fetch kit from a URL                                          |
| `--jit`                       | Run from TypeScript source instead of compiled JS             |
| `--internal`                  | Use internal kit directory and infix from config              |
| `--checklists, -c <name,...>` | Filter checklists within the selected kit                     |
| `--json`                      | Output results as JSON                                        |
| `--fail-on <severity>`        | Fail on this severity or above (`error`, `warn`, `recommend`) |
| `--report-on <severity>`      | Show this severity or above (`error`, `warn`, `recommend`)    |

`--checklists` selects checklists within one kit. Pair it with a single positional kit, with `--file` or `--url`, or with no kit at all to filter the default kit. Naming two or more kits, or naming one that already carries a `:checklist` filter, is an error rather than a merge.

`--report-on` prunes only the reported detail tree, and keeps the parent checks of anything it shows so nesting stays intact. Summary counts, worst severity, and the exit code always reflect the whole run.

### Exit codes

| Code | Meaning                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Ran and found no problems                                                                                                     |
| `1`  | Ran and found problems with the repo or its kits: failed checks, a `verify` drift or missing kit, a kit that fails to compile |
| `2`  | Could not complete the invocation: a usage, config, kit-load, or internal error                                               |

The distinction is between "fix the repo" (`1`) and "fix the invocation" (`2`), so a pipeline can branch on which is which. `rdy list` and `rdy init` produce only `0` and `2` — neither can find problems to report.

A run that loses a kit part-way exits `2` even when the kits that ran also found problems, since part of the invocation did not complete. It still reports what it collected.

### JSON output

With `--json`, stdout carries exactly one JSON document, chosen by how far the invocation got: the report when a run produced one, and otherwise an error envelope. The exceptions are `--help` and `--version`, which have no JSON form: their text goes to stderr and stdout stays empty.

```json
{ "error": { "code": "usage", "message": "Unknown option '--bogus'" } }
```

`code` is one of `usage`, `config`, `kit-load`, or `internal`. Every human-readable line — help text, progress headers, warnings — goes to stderr, and the exit code does not determine which document appears.

The envelope covers only failures that precede dispatch. Once the run reaches its kits, a kit that fails is reported inside the report instead of replacing it, so each entry in `kits` takes one of two shapes, told apart by whether `error` is present:

```json
{ "name": "release", "error": { "code": "kit-load", "message": "Cannot find .readyup/kits/release.js" } }
```

An error entry carries no counts, because a kit that never ran has none to report; the top-level totals cover only the kits that ran. In human mode the same failure goes to stderr, which keeps it distinct from a failed check. A run of more than one kit prefixes the kit's name, as `Error [release]: ...`.

### Kit sources

The `--from` flag accepts these source types:

| Source     | Format                    | Example                                                 |
| ---------- | ------------------------- | ------------------------------------------------------- |
| Bitbucket  | `bitbucket:ws/repo[@ref]` | `--from bitbucket:team/ops`                             |
| GitHub     | `github:org/repo[@ref]`   | `--from github:acme/ops` or `--from github:acme/ops@v2` |
| Local repo | `<path>`                  | `--from .` or `--from ../other-repo`                    |
| Global     | `global`                  | `--from global`                                         |
| Directory  | `dir:<path>`              | `--from dir:/shared/kits`                               |

`@ref` defaults to `main` when omitted. Local repo paths look for kits in `<path>/.readyup/kits/`, while `dir:` paths are used directly.

### Authentication for remote sources

Private repositories are accessed via tokens resolved from ambient sources:

- **GitHub** (`--from github:`): reads `GITHUB_TOKEN`; falls back to `gh auth token` when the env var is unset.
- **Bitbucket** (`--from bitbucket:`): reads `BITBUCKET_TOKEN`.

When no token is available, requests go anonymous and only public repositories will succeed.

### List

```
rdy list                       List internal and compiled kits (owner view)
rdy list --from <path>         List compiled kits at a local path
rdy list --from global         List compiled kits in the global directory
rdy list --from dir:<path>     List kits in an arbitrary directory
rdy list --from github:org/repo[@ref]      List kits from a GitHub manifest
rdy list --from bitbucket:ws/repo[@ref]    List kits from a Bitbucket manifest
```

## Authoring API

All helpers are type-safe identity functions that provide editor autocomplete without runtime overhead. Import them from `readyup`.

| Helper                     | Description                          |
| -------------------------- | ------------------------------------ |
| `defineRdyConfig`          | Repo-level config                    |
| `defineRdyKit`             | Kit (collection of checklists)       |
| `defineRdyChecklist`       | Flat checklist                       |
| `defineRdyStagedChecklist` | Staged checklist (sequential groups) |
| `defineChecklists`         | Array of checklists                  |

## Check utilities

Reusable check functions for common assertions:

```ts
import { fileExists, fileContains, hasPackageJsonField } from 'readyup/check-utils';
```

| Function                                    | Description                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `fileExists(path)`                          | File exists at path                                                     |
| `fileContains(path, pattern)`               | File matches a string or regex                                          |
| `fileDoesNotContain(path, pattern)`         | File does not match                                                     |
| `readFile(path)`                            | Read file contents (returns `undefined` if missing)                     |
| `hasPackageJsonField(field, value?)`        | package.json has a field (optionally matching a value)                  |
| `hasDevDependency(name)`                    | package.json has a dev dependency                                       |
| `hasMinDevDependencyVersion(name, version)` | Dev dependency meets minimum version                                    |
| `readPackageJson()`                         | Parse package.json                                                      |
| `discoverWorkspaces(options?)`              | Enumerate monorepo workspaces (single-workspace repos return one entry) |
| `compareVersions(a, b)`                     | Compare semver strings                                                  |
| `runGit(path, ...args)`                     | Run a git command and return trimmed stdout                             |
| `expandHome(path)`                          | Expand leading `~` or `~/` to the home directory                        |
| `isAtRepoRoot(path)`                        | Path is the top of a git working tree                                   |
| `isGitRepo(path)`                           | Path is inside a git working tree                                       |
| `compareLocalRefs(path, refA, refB)`        | Compare two local refs (discriminated-union result)                     |
| `compareRefToRemote(path, ref, remote?)`    | Compare a local ref to its remote counterpart                           |
| `makeLocalRefSyncCheck(options)`            | Check factory: verify two local refs match                              |
| `makeRemoteRefSyncCheck(options)`           | Check factory: verify a ref matches its remote counterpart              |

### Discovering workspaces

`discoverWorkspaces()` returns a uniform `Workspace[]` that collapses pnpm, npm, and yarn monorepo conventions — and single-workspace repos — into one iteration shape. Every entry includes `dir` (relative to `cwd`; `'.'` for a single-workspace repo), `absolutePath`, `name`, `isPackage` (true when `package.json.private !== true`), and the parsed `packageJson`.

Common filter pattern — get all publishable workspaces:

```ts
import { discoverWorkspaces } from 'readyup/check-utils';

const packages = discoverWorkspaces({ filter: (w) => w.isPackage });
```

Note: `pnpm-workspace.yaml` is read by a minimal block-sequence parser; configs using YAML anchors, flow sequences, negation patterns, or other non-trivial features will raise a clear error with a pointer to file an issue.

## Compatibility

`readyup/check-utils` is the stable, versioned surface for kit-author imports of check utilities. It follows semver: no breaking changes within a major version.

Compiled kits embed nothing of readyup itself — the runner satisfies `readyup` and `readyup/*` imports at runtime via its module-resolution hook. Kits are therefore version-coupled to the runner across breaking boundaries: when you upgrade readyup across a major, recompile your kits with `rdy compile` so any newly-shipped or changed check utilities are picked up.

## License

MIT
