<!-- readme-type: cli -->

# @williamthorsen/npm-tools

A CLI that runs npm package and registry chores. It lists a pnpm workspace's packages and whether each can be published, publishes the placeholder that a new package needs before `npm trust` can be configured for it, and moves a package's trusted publisher to another GitHub repository.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add -g @williamthorsen/npm-tools
```

Node 24.16 or later is required. The registry commands also need the `npm` CLI on PATH and logged in.

## Usage

List the packages of the pnpm workspace that contains the working directory, and whether each can be published:

```bash
thor-npm list-packages
```

```
PUBLISH  NAME                             VERSION  DIRECTORY        DESCRIPTION
yes      @williamthorsen/atlassian-tools  0.1.3    atlassian-tools  Work with Jira Cloud from the command line
no       @williamthorsen/compositor       0.5.6    compositor       Resolve declared content across precedence-ordered sources …
```

`--json` prints every field in full, for a script to read. `thor-npm list-packages --help` describes the columns.

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
