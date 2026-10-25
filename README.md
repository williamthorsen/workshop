<!-- readme-type: monorepo-root -->

# Workshop

Open-source utilities by [William Thorsen](https://github.com/williamthorsen).

## Packages

| Package                                       | Description                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| [`atlassian-tools`](packages/atlassian-tools) | Work with Jira Cloud from the command line                                      |
| [`chrome-tools`](packages/chrome-tools)       | Launch and manage Chrome debug sessions                                         |
| [`git-tools`](packages/git-tools)             | Utilities for working with git                                                  |
| [`launchd-agent`](packages/launchd-agent)     | Install, replace, restart, inspect, and remove per-user launchd agents on macOS |
| [`nodejs-tools`](packages/nodejs-tools)       | Inspect Node.js toolchains, prune node_modules, and resolve asdf's node binary  |
| [`overlay`](packages/overlay)                 | Idempotent overlay of a canonical scaffolding file set, backed by chezmoi       |
| [`readyup`](packages/readyup)                 | Pre-deployment verification checks with TypeScript kits                         |
| [`repo-tools`](packages/repo-tools)           | Act on the repositories indexed by a machine-local repo registry                |
| [`secret-tools`](packages/secret-tools)       | Manage secrets in the OS credential store                                       |
| [`systemd-service`](packages/systemd-service) | Install, restart, inspect, and remove systemd services on Linux                 |

## Development

This project uses [pnpm](https://pnpm.io/) (managed via [corepack](https://nodejs.org/api/corepack.html)) and [nmr](https://www.npmjs.com/package/@williamthorsen/nmr) as the script runner.

```shell
corepack enable
pnpm install
nmr check
```

## License

ISC
