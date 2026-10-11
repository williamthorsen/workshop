<!-- readme-type: cli -->

# @williamthorsen/atlassian-tools

A CLI that reconciles a Jira Cloud project against a declarative spec, lists the project's work items, and manages the API token with which it authenticates.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add -g @williamthorsen/atlassian-tools
```

Node 24 or later is required. Storing the token in the keychain requires macOS.

## Usage

Store the API token once, then list a project's open work items:

```bash
export JIRA_EMAIL=me@example.com
thor-jira auth set
thor-jira issue list --site acme.atlassian.net --project PROJ
```

`auth set` stores the token in the macOS keychain under the service `toolbelt.atlassian.jira`, so a token stored through `tb-jira` is read without being stored again. A command also takes the token from `JIRA_API_TOKEN`, `--token-stdin`, or `--token-command`.

Reconcile a project's statuses, workflow transitions, and board features against the `jira-project-spec.json` found by ascending from the working directory. Preview the plan with `--dry-run`, then apply it:

```bash
thor-jira configure-project --dry-run
thor-jira configure-project
```

The run is idempotent, and it exits 5 when it wrote but the project still does not match the spec.

`thor-jira --help` and each command's `--help` list the flags, the order in which each value is resolved, and the exit codes.
