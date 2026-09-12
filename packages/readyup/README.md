<!-- readme-type: cli -->

# ReadyUp

Run pre-deployment verification checks from checklists authored in TypeScript, locally or from a remote source, with pass/fail reporting and remediation hints.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add --save-dev readyup
```

Node 24 or later is required, for the runner and for the kits it compiles.

## Quick start

```bash
rdy init
```

This creates two files:

**`.config/readyup.config.ts`** -- repo-level settings:

```ts
import { defineRdyConfig } from 'readyup';

export default defineRdyConfig({
  compile: {
    srcDir: '.readyup/kits',
    outDir: '.readyup/kits',
  },
});
```

**`.readyup/kits/default.ts`** -- starter kit:

```ts
import { defineRdyKit } from 'readyup';

export default defineRdyKit({
  checklists: [
    {
      name: 'deploy',
      checks: [
        {
          name: 'NODE_ENV is set',
          check: () => {
            const value = process.env['NODE_ENV'];
            if (!value) return { ok: false, detail: 'NODE_ENV has no value in the environment' };
            return { ok: true, detail: `NODE_ENV is ${value}` };
          },
          fix: 'Set NODE_ENV before deploying',
        },
      ],
    },
  ],
});
```

Compile the kit, then run it:

```bash
rdy compile
rdy run
```

With `NODE_ENV` unset:

```
🔴 NODE_ENV is set
   NODE_ENV has no value in the environment
── Fixes
🔴 NODE_ENV is set
   💊 Set NODE_ENV before deploying
🔴 Total: 1 error (0ms)
```

`rdy run --jit` skips compilation and runs the TypeScript source directly, which is the faster loop while writing checks. Compiled kits stay the vetted artifact: they are what `rdy verify` hashes and what a consumer running `rdy run --from` gets.

## Running a kit published by someone else

```bash
rdy run --from npm:@acme/eslint-config   # a kit published by an installed package
rdy run --from github:acme/ops           # a kit published by a repository
rdy run --packages                       # every package listed by the config, in one run
```

[Kit sources](docs/running-checks.md#kit-sources) covers each form, and [package-hosted kits](docs/publishing-kits.md#package-hosted-kits) covers the config list.

## Gating CI

```bash
rdy run              # fails on a failed check
rdy verify --rebuild # fails on a bundle that no longer reproduces from its source
```

[Exit codes](docs/running-checks.md#exit-codes) gives what each exit status means, and [verifying by recompiling](docs/publishing-kits.md#verifying-by-recompiling) gives what `--rebuild` compares.

## Documentation

- [Concepts](docs/concepts.md): Kits, severities, statuses, and thresholds
- [Authoring kits](docs/authoring-kits.md): Writing kits, checklists, and checks
- [Running checks](docs/running-checks.md): Selecting what runs, reading the output, and suppressing a finding
- [JSON output](docs/json-output.md): The JSON report and its schemas
- [Publishing kits](docs/publishing-kits.md): Compiling, packaging, and verifying kits
- [Check utilities](docs/check-utils.md): Helpers that a kit imports from readyup

`rdy help <topic>` prints the same files in a terminal, and `rdy help` lists the topic names. `rdy <command> --help` prints each command's own options.

## Compatibility

`readyup/check-utils` is the stable, versioned surface for kit-author imports. It follows semver: no breaking changes within a major version.

Compiled kits embed nothing of ReadyUp itself -- the runner satisfies `readyup` and `readyup/*` imports at runtime via its module-resolution hook. Kits are therefore version-coupled to the runner across breaking boundaries: when upgrading across a major, recompile with `rdy compile`.

## License

ISC
