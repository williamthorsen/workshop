<!-- readme-type: cli -->

# @williamthorsen/repo-tools

A CLI that lists, scans, and registers the repositories indexed by a machine-local registry, `~/.config/repos.yaml`, so that scripts and agents can target the repos on a machine as a set.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add -g @williamthorsen/repo-tools
```

Node 24 or later is required.

## Usage

Print the absolute path of every repo that deploys from a `live` worktree:

```bash
thor-repo list --tag live
```

`list` narrows by tag (`--tag`) and by stack (`--stack`), and `--json` emits whole entries under a `repos` key with each path as written:

```bash
thor-repo list --stack nmr --json
```

`scan` reports each repo whose declared stack differs from the one that its tracked files signal, as `+name` for a missing name and `-name` for a stale one. `--write` rewrites those entries:

```bash
thor-repo scan --write --file path/to/branch-worktree/repos.yaml
```

`add` prints the entry that registers a clone, deriving `name` and `repo` from its `origin` remote and `stack` from its tracked files. `--write` appends it:

```bash
thor-repo add ~/repos/example --write
```

Every verb reads `~/.config/repos.yaml` unless `--file` names another registry. `thor-repo --help` and `thor-repo <verb> --help` print the full options and the stack names that `--stack` accepts.

## Registry format

```yaml
repos:
  - name: example
    path: ~/repos/example
    repo: owner/example
    tags: [live]
    stack: [nmr, react]
```

- `name`: the repo's name on its remote.
- `path`: the clone's location, written with a leading `~`; `list` expands it, and `list --json` leaves it as written.
- `repo`: the GitHub path, in the `owner/name` form that `gh --repo` takes.
- `tags`: optional, asserted by hand. `live` marks a repo that deploys from a `live` worktree.
- `stack`: optional, the built-in stack names that `scan` derives from the clone's tracked files. Edit it through `scan --write` rather than by hand.

## The `live` guard

`--write` refuses a registry whose resolved file is in a checkout on a branch named `live`, because that checkout deploys verified code rather than work in progress. When `~/.config/repos.yaml` is a link into a `live` worktree, pass `--file` naming the registry's copy in a branch worktree.
