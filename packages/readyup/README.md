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

**`.config/rdy.config.ts`** — repo-level settings:

```ts
import { defineRdyConfig } from 'readyup';

export default defineRdyConfig({
  compile: {
    srcDir: '.rdy/kits',
    outDir: '.rdy/kits',
  },
});
```

**`.rdy/kits/default.ts`** — starter kit:

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

### Run options

| Option                          | Description                               |
| ------------------------------- | ----------------------------------------- |
| `--file, -f <path>`             | Path to a local kit file                  |
| `--github, -g <org/repo[@ref]>` | Fetch kit from a GitHub repository        |
| `--local, -l <path>`            | Load compiled kit from a local repository |
| `--url, -u <url>`               | Fetch kit from a URL                      |
| `--kit, -k <name>`              | Kit name (default: `"default"`)           |
| `--json, -j`                    | Output results as JSON                    |
| `--fail-on, -F <severity>`      | Fail on this severity or above            |
| `--report-on, -R <severity>`    | Report this severity or above             |

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

| Function                                    | Description                                            |
| ------------------------------------------- | ------------------------------------------------------ |
| `fileExists(path)`                          | File exists at path                                    |
| `fileContains(path, pattern)`               | File matches a string or regex                         |
| `fileDoesNotContain(path, pattern)`         | File does not match                                    |
| `readFile(path)`                            | Read file contents (returns `undefined` if missing)    |
| `hasPackageJsonField(field, value?)`        | package.json has a field (optionally matching a value) |
| `hasDevDependency(name)`                    | package.json has a dev dependency                      |
| `hasMinDevDependencyVersion(name, version)` | Dev dependency meets minimum version                   |
| `readPackageJson()`                         | Parse package.json                                     |
| `compareVersions(a, b)`                     | Compare semver strings                                 |

## License

MIT
