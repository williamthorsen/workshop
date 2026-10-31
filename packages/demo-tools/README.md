<!-- readme-type: cli -->

# @williamthorsen/demo-tools

A CLI that runs [aidemo](https://github.com/tandryukha/aidemo) demos with the environment that each demo repository configures, for the CLI and the MCP server alike.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

In the demo repository, install the package beside aidemo, which is a peer dependency at 0.17.0 or later:

```bash
pnpm add --save-dev @williamthorsen/demo-tools @tandryukha/aidemo
```

Node 24 or later is required. `thor-demo` runs the aidemo installed in the demo repository, so a global install of `thor-demo` uses each repository's pinned engine.

```bash
thor-demo render quickstart
```

## Configuring a demo repository

`.config/thor-demo.yaml` marks the root of the demo repository: `thor-demo` looks for it in the working directory and its parents, and runs aidemo from that root. Every key is optional:

```yaml
# The directory, relative to the root, whose subdirectories that contain generated/storyboard.json are the demos.
# Default: demos
demosDir: demos

aidemo:
  # Variables to set for aidemo. Each value expands ${VAR} from the environment and a leading ~. Default: none.
  env:
    AIDEMO_CHROME_PROFILE: ~/.cache/aidemo/chrome-profile
    AIDEMO_TTS_PROVIDER: local
```

An unknown key, an unset variable, and any other expansion form, such as `${VAR:-default}`, are errors.

`thor-demo` removes `AIDEMO_OPENAI_BASE_URL`, `OPENAI_API_KEY`, and `OPENAI_BASE_URL` from the environment that it passes on, which keeps captions offline with a local voice. A variable that `aidemo.env` declares reaches aidemo: `OPENAI_API_KEY: ${OPENAI_API_KEY}` lets the key through. aidemo loads the root's `.env` over its environment, so `thor-demo` warns when that file sets one of the three and `aidemo.env` does not declare it.

To give aidemo's MCP server the same environment, launch it through `thor-demo` in the repository's `.mcp.json`:

```json
{
  "mcpServers": {
    "aidemo": { "command": "thor-demo", "args": ["mcp"] }
  }
}
```

## Rendering and probing

```bash
thor-demo render quickstart --tts local
thor-demo probe demos/quickstart --golden
```

The options after the demo reach aidemo unchanged. `-h` and `--help` print the command's help, unless they follow a literal `--`: `thor-demo render quickstart -- --help` passes `--help` to aidemo.

## Captions

Each render writes `output/final-demo.srt` and `output/final-demo.vtt` beside the video. To deliver the captions as a subtitle track, off by default, rather than burned into the frames, set this in the demo's storyboard:

```json
"captions": { "style": "none", "track": true }
```
