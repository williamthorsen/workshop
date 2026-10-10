<!-- readme-type: cli -->

# @williamthorsen/secret-tools

A CLI that stores and reads secrets in the macOS keychain. A secret is named by a service and an optional account, so one service can hold a secret per account.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add -g @williamthorsen/secret-tools
```

Node 24 or later and macOS are required.

## Usage

Store a secret, then read it into a variable. At a terminal, `set` prompts twice and echoes nothing; piped, it reads stdin and drops one trailing newline:

```bash
thor-secret set atlassian-api-token --account me@example.com
pbpaste | thor-secret set atlassian-api-token

export ATLASSIAN_API_TOKEN=$(thor-secret get atlassian-api-token --account me@example.com)
```

`has` reports through its exit status whether a secret is stored, without reading it, and `delete` removes one. Each subcommand takes `--account <name>` and `--keychain <path>`, which acts on a keychain other than the default search list.

`get`, `has`, and `delete` exit 1 when no secret is stored, which a script can tell apart from a keychain failure (3) or a usage error (2):

```bash
if token=$(thor-secret get atlassian-api-token); then
  curl --user "me@example.com:$token" https://example.atlassian.net/rest/api/3/myself
elif [ $? -eq 1 ]; then
  echo 'No token stored. Run `thor-secret set atlassian-api-token`.' >&2
fi
```

`thor-secret --help` and each subcommand's `--help` list the flags and exit codes.
