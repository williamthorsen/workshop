<!-- readme-type: cli -->

# @williamthorsen/repo-tools

A CLI that lists, scans, registers, and moves the repositories indexed by a machine-local registry, `~/.config/repos.yaml`, so that scripts and agents can target the repos on a machine as a set.

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

`list` narrows by tag (`--tag`), by stack (`--stack`), by GitHub visibility (`--visibility public|private`), and by CI runner label (`--runner`), and `--json` emits whole entries under a `repos` key with each path as written:

```bash
thor-repo list --stack nmr --json
```

`list` prints only the repos whose clone is present on this machine. `--clone absent` lists the registered repos that this machine has not cloned, and `--clone all` lists every entry:

```bash
thor-repo list --clone absent
```

`scan` reports each repo whose declared stack differs from the one that its tracked files signal, as `+name` for a missing name and `-name` for a stale one, and whose `visibility` or `runner` differs from GitHub, as `visibility=<value>`, `runner=<label>`, or `-runner`. It reads GitHub through `gh`, for every entry with a `repo`, whether or not its clone is on this machine. An entry whose clone is absent, or whose tracked files git cannot list, keeps its stack, and one whose GitHub read fails keeps its visibility and runner; `scan` reports each case, with git's or GitHub's reason, on stderr. It also warns about a public repo whose `runner` is set, since a self-hosted runner must not run a fork's pull request. `--write` rewrites the changed entries:

```bash
thor-repo scan --write --file path/to/branch-worktree/repos.yaml
```

`add` prints the entry that registers a clone, deriving `name` from its `origin` remote, `stack` from its tracked files, and, for an origin on `github.com`, `repo` from the remote and `visibility` and `runner` from GitHub, which it omits when GitHub cannot be read. For an origin hosted elsewhere, `add` omits `repo`, `visibility`, and `runner` and does not query GitHub. `--write` appends the entry:

```bash
thor-repo add ~/repos/example --write
```

`move` moves a registered clone to a new path, with each linked worktree beside it, whose name keeps its suffix under the new name (`app.live` becomes `kit.live`), and repairs every worktree's link. For each moved worktree, including one inside the clone, it then runs `direnv allow` when the worktree has an `.envrc` at its root, and gives its Claude Code session directory, under `$CLAUDE_CONFIG_DIR/projects` or else `~/.claude/projects`, the name that matches the new path. It removes a former parent directory that the move leaves empty, ignoring a `.DS_Store`. It reports a failure in these follow-ups, or a session directory whose new name is taken, on stderr without changing the exit status. It sets the entry's `path` and appends the former path to `formerPaths`, then prints each remaining reference to the old paths in the tracked files of the registered clones on this machine. `--search <path>`, which repeats, adds the text files and the symlink targets under a directory to that report, and `--dry-run` reports the moves, the follow-ups, and the references without changing anything:

```bash
thor-repo move app ~/repos/tools/kit --dry-run --search ~/.config
```

`apply-moves` runs on each other machine that shares the registry. It moves each clone that it finds at one of its entry's `formerPaths` while the entry's `path` is absent, in the same way, follow-ups included, and does nothing when no clone needs moving:

```bash
thor-repo apply-moves
```

Every verb reads `~/.config/repos.yaml` unless `--file` names another registry. `thor-repo --help` and `thor-repo <verb> --help` print the full options and the stack names that `--stack` accepts.

## Registry format

```yaml
repos:
  - name: example
    path: ~/repos/example
    formerPaths: [~/repos/old/example]
    repo: owner/example
    prefix: Ex
    visibility: private
    runner: imac2
    tags: [live]
    stack: [nmr, react]
```

- `name`: the repo's name on its remote.
- `path`: the clone's location, written with a leading `~`; `list` expands it, and `list --json` leaves it as written.
- `formerPaths`: optional, the paths from which `move` moved the clone, oldest first. `apply-moves` reads them to find a clone that another machine has not moved yet.
- `repo`: the GitHub path, in the `owner/name` form that `gh --repo` takes; absent for a repo hosted elsewhere.
- `prefix`: optional, asserted by hand, a short identifier by which a tool shows the repo. It is non-empty and contains neither whitespace nor a period, and no two entries declare prefixes that are equal regardless of case; every verb refuses a registry that breaks either rule.
- `visibility`: `public` or `private`, the repo's visibility on GitHub, absent when the entry has no `repo`. `scan` writes it.
- `runner`: optional, the label that the repo's `CI_RUNS_ON` Actions variable selects: a bare label as written, or a JSON string decoded. `scan` writes it, removes it when the variable is unset, and keeps it, with a report, when the variable holds a list or an object.
- `tags`: optional, asserted by hand. `live` marks a repo that deploys from a `live` worktree.
- `stack`: optional, the built-in stack names that `scan` derives from the clone's tracked files. Edit it through `scan --write` rather than by hand.

## The `live` guard

`--write` and `move` refuse a registry whose resolved file is in a checkout on a branch named `live`, because that checkout deploys verified code rather than work in progress. When `~/.config/repos.yaml` is a link into a `live` worktree, pass `--file` naming the registry's copy in a branch worktree.
