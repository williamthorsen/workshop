<!-- readme-type: cli -->

# @williamthorsen/npm-tools

A CLI that runs npm registry chores. It publishes the placeholder that a new package needs before `npm trust` can be configured for it, and moves a package's trusted publisher to another GitHub repository.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add -g @williamthorsen/npm-tools
```

Node 24 or later is required, and the `npm` CLI must be on PATH and logged in.

## Usage

npm configures trusted publishing only for a name that the registry already has. Once per new package, publish a `0.0.0` placeholder that holds only `package.json` and `README.md`, then configure `npm trust`; every later version is published through trusted publishing.

Check the name and the npm session, and see the summary, without publishing:

```bash
thor-npm publish-placeholder @scope/new-package --dry-run
```

Publish it, after confirming at the prompt:

```bash
thor-npm publish-placeholder @scope/new-package
```

`thor-npm publish-placeholder --help` lists the options and exit codes.

When a package moves to another repository, its trusted publisher has to move with it. Check the current trust and see the summary, without changing anything:

```bash
thor-npm move-trust @scope/package --from owner/old-repo --to owner/new-repo --dry-run
```

Move it, after confirming at the prompt. The new trust keeps the old one's workflow file, environment, and permissions; `--file` names a different workflow file:

```bash
thor-npm move-trust @scope/package --from owner/old-repo --to owner/new-repo
```

npm asks for approval at the terminal, so run it from one. `thor-npm move-trust --help` lists the options.
