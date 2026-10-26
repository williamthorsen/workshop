<!-- readme-type: cli -->

# @williamthorsen/chrome-tools

A CLI that launches Chrome with remote debugging on a profile and port derived from the working directory's repository and branch, so that each worktree gets its own browser, which DevTools clients such as Playwright can attach to.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add -g @williamthorsen/chrome-tools
```

Node 24 or later and macOS are required.

## Usage

Launch the working directory's browser on the page under development. On branch `321` of repository `widget`, the profile is `widget-321` and the port is 9321, and the first launch creates the profile:

```bash
thor-chrome http://localhost:4798
```

Ask for the endpoint to attach a client to, as one JSON document, whether or not the browser is running:

```bash
thor-chrome status --json
```

Quit the browsers to which no DevTools client has connected for two hours, then delete the profiles whose branch no longer exists:

```bash
thor-chrome quit --idle 2h
thor-chrome delete --stale --force
```

Profiles live under `$XDG_DATA_HOME/thor-chrome/profiles`, which defaults to `~/.local/share/thor-chrome/profiles`. `thor-chrome --help` documents every command, option, environment variable, and JSON field and error code.
