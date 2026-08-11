# Workshop

Open-source utilities by [William Thorsen](https://github.com/williamthorsen).

## Packages

| Package                       | Description                                                               |
| ----------------------------- | ------------------------------------------------------------------------- |
| [`overlay`](packages/overlay) | Idempotent overlay of a canonical scaffolding file set, backed by chezmoi |
| [`readyup`](packages/readyup) | Pre-deployment verification checks with TypeScript kits                   |

## Development

This project uses [pnpm](https://pnpm.io/) (managed via [corepack](https://nodejs.org/api/corepack.html)) and [nmr](https://www.npmjs.com/package/@williamthorsen/nmr) as the script runner.

```shell
corepack enable
pnpm install
nmr check
```

## License

MIT
