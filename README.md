<!-- readme-type: monorepo-root -->

# Workshop

Open-source utilities by [William Thorsen](https://github.com/williamthorsen).

## Packages

| Package                             | Description                                                               |
| ----------------------------------- | ------------------------------------------------------------------------- |
| [`git-tools`](packages/git-tools)   | Utilities for working with git                                            |
| [`overlay`](packages/overlay)       | Idempotent overlay of a canonical scaffolding file set, backed by chezmoi |
| [`readyup`](packages/readyup)       | Pre-deployment verification checks with TypeScript kits                   |
| [`repo-tools`](packages/repo-tools) | Act on the repositories indexed by a machine-local repo registry          |

## Development

This project uses [pnpm](https://pnpm.io/) (managed via [corepack](https://nodejs.org/api/corepack.html)) and [nmr](https://www.npmjs.com/package/@williamthorsen/nmr) as the script runner.

```shell
corepack enable
pnpm install
nmr check
```

## License

ISC
