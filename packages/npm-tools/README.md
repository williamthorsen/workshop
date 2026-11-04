<!-- readme-type: cli -->

# @williamthorsen/npm-tools

A CLI that runs npm registry chores. It publishes the placeholder that a new package needs before `npm trust` can be configured for it.

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
