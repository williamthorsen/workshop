<!-- readme-type: cli -->

# @williamthorsen/git-tools

A CLI that derives values from git branch names: a stable number per branch, and the ID of the ticket that a branch encodes.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add -g @williamthorsen/git-tools
```

Node 24 or later is required.

## Usage

Derive a port for the checked-out branch, within a range. The number is the ticket that the branch encodes, rotated into the bounds, or a hash of the name when it encodes none:

```bash
thor-git branch-number --min 9000 --max 9999
```

Print the ticket that a branch encodes, as its ID or, with `--json`, as the whole ref. A branch that encodes no ticket exits 1:

```bash
thor-git ticket-ref MAC-42/feat/foo --json
# {"id":"MAC-42","key":"MAC","number":42}
```

Each subcommand reads the checked-out branch when no branch is given. `thor-git --help` lists the flags and exit codes.
