# readyup

Run pre-deployment verification checks against your environment and configuration. Define checklists in TypeScript kits, run them locally or from a remote source, and get clear pass/fail reporting with remediation hints.

## Installation

```bash
pnpm add -D readyup
```

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

### Run options

| Option                        | Description                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| `--from <source>`             | Kit source (see [kit sources](#kit-sources) below)            |
| `--file, -f <path>`           | Path to a local kit file                                      |
| `--url, -u <url>`             | Fetch kit from a URL                                          |
| `--jit, -J`                   | Run from TypeScript source instead of compiled JS             |
| `--internal, -i`              | Use internal kit directory and infix from config              |
| `--checklists, -c <name,...>` | Filter checklists (with `--file` or `--url` only)             |
| `--json, -j`                  | Output results as JSON                                        |
| `--fail-on, -F <severity>`    | Fail on this severity or above (`error`, `warn`, `recommend`) |
| `--report-on, -R <severity>`  | Report this severity or above (`error`, `warn`, `recommend`)  |

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

### List

```
rdy list                       List internal and compiled kits (owner view)
rdy list --from <path>         List compiled kits at a local path
rdy list --from global         List compiled kits in the global directory
rdy list --from dir:<path>     List kits in an arbitrary directory
```

Listing from GitHub/Bitbucket sources is not yet supported.

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
import { fileExists, fileContains, hasPackageJsonField } from 'readyup';
```

| Function                                    | Description                                                |
| ------------------------------------------- | ---------------------------------------------------------- |
| `fileExists(path)`                          | File exists at path                                        |
| `fileContains(path, pattern)`               | File matches a string or regex                             |
| `fileDoesNotContain(path, pattern)`         | File does not match                                        |
| `readFile(path)`                            | Read file contents (returns `undefined` if missing)        |
| `hasPackageJsonField(field, value?)`        | package.json has a field (optionally matching a value)     |
| `hasDevDependency(name)`                    | package.json has a dev dependency                          |
| `hasMinDevDependencyVersion(name, version)` | Dev dependency meets minimum version                       |
| `readPackageJson()`                         | Parse package.json                                         |
| `compareVersions(a, b)`                     | Compare semver strings                                     |
| `runGit(path, ...args)`                     | Run a git command and return trimmed stdout                |
| `expandHome(path)`                          | Expand leading `~` or `~/` to the home directory           |
| `isAtRepoRoot(path)`                        | Path is the top of a git working tree                      |
| `isGitRepo(path)`                           | Path is inside a git working tree                          |
| `compareLocalRefs(path, refA, refB)`        | Compare two local refs (discriminated-union result)        |
| `compareRefToRemote(path, ref, remote?)`    | Compare a local ref to its remote counterpart              |
| `makeLocalRefSyncCheck(options)`            | Check factory: verify two local refs match                 |
| `makeRemoteRefSyncCheck(options)`           | Check factory: verify a ref matches its remote counterpart |

## License

MIT
