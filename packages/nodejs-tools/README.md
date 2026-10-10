<!-- readme-type: cli -->

# @williamthorsen/nodejs-tools

A CLI that inspects Node.js runtimes and toolchains and prunes `node_modules` directories: It finds asdf shims stranded by a nodejs version switch, checks the pnpm that runs against a project's `packageManager` pin, and deletes the `node_modules` directories that a protect-list and recent activity do not keep.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add -g @williamthorsen/nodejs-tools
```

Node 24 or later is required.

`thor-node` replaces `tb-node` from `@williamthorsen/toolbelt.nodejs`. Its protect-list moved from `~/.config/tb-node/` to `~/.config/thor-node/`.

## Usage

Check for stranded shims after switching nodejs versions under asdf. Each is printed with the commands that provide or remove it:

```bash
thor-node asdf-shims
```

Check that the pnpm that runs here matches the nearest `packageManager` pin. A mismatch is printed with the commands that install the pin through whatever provides pnpm now:

```bash
thor-node pnpm
```

Prune the `node_modules` directories under `~/repos` (or `--root <path>`). Without `--apply`, the command only reports what it would delete:

```bash
thor-node prune-modules
thor-node prune-modules --apply   # asks before deleting; --no-confirm skips the question
```

A directory is kept when the protect-list matches it or when its project was active within the last 30 days. The protect-list is `~/.config/thor-node/protected-node-modules.txt`, or the file named by `--protect-list`. Each machine supplies its own: A missing default file protects nothing, so create it before the first `--apply`.

Each check exits 1 when it finds something to fix and 3 when it does not apply, so a script can act on the status:

```bash
thor-node asdf-shims >/dev/null
if [ $? -eq 1 ]; then
  echo 'Stranded shims: run `thor-node asdf-shims` for the remedies.' >&2
fi
```

`thor-node --help` and each subcommand's `--help` list the flags, the protect-list format, and the exit codes.
