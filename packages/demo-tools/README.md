<!-- readme-type: cli -->

# @williamthorsen/demo-tools

A CLI that runs [aidemo](https://github.com/tandryukha/aidemo) demos with the environment that each demo repository configures, for the CLI and the MCP server alike, and installs a local voice clone for narrating them.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

In the demo repository, install the package beside aidemo, which is a peer dependency at 0.20.3 or later:

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
    AIDEMO_TTS_PROVIDER: local

archive:
  # The directory under the archive root that holds this repository's takes. Default: the root directory's name.
  label: product-demos
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

## Recording profile

aidemo records in a Chrome profile, which holds any login that a demo needs. `thor-demo` gives each repository its own profile, outside `node_modules`, so that an aidemo upgrade or reinstall keeps it:

```
~/.local/share/thor-demo/chrome-profiles/<archive.label>/
```

`archive.label` defaults to the root directory's name, so worktrees of a repository whose `.config/thor-demo.yaml` is in a package directory share one profile. When the file is at the git root, each worktree has a profile of its own unless `archive.label` is set. A non-empty `AIDEMO_CHROME_PROFILE` in `aidemo.env` takes precedence, and one in the environment comes next.

Sign in on the profile, then check or wipe it:

```bash
thor-demo login --url https://app.example.com/
thor-demo profile
thor-demo profile reset
```

A login made on aidemo's own profile before this default existed does not carry over; sign in once with `thor-demo login`.

## Ignoring aidemo's working files

Before each `render` and `probe`, `thor-demo` warns about each of aidemo's working paths in the demo that git does not ignore or that git tracks. [`src/demos/aidemo-working-paths.ts`](https://github.com/williamthorsen/workshop/blob/main/packages/demo-tools/src/demos/aidemo-working-paths.ts) lists them. With demos in `demos/`, these rules cover them:

```gitignore
/demos/*/.chrome-profile-fresh/
/demos/*/audio/
/demos/*/generated/captions.*
/demos/*/generated/params.json
/demos/*/generated/timeline*.json
/demos/*/logs/
/demos/*/output/
/demos/*/recordings/
```

## Rendering and probing

```bash
thor-demo render quickstart --tts local
thor-demo probe demos/quickstart --golden
```

The options after the demo reach aidemo unchanged. `-h` and `--help` print the command's help, unless they follow a literal `--`: `thor-demo render quickstart -- --help` passes `--help` to aidemo.

## Demo videos

The published videos are assets of the [demo-tools releases](https://github.com/williamthorsen/workshop/releases?q=demo-tools).

`demos/agent-records-demo` renders a video, about three minutes long, in which a coding agent writes a demo storyboard through aidemo's MCP server and aidemo renders it: the finished output, the prompt and the agent's tool calls, the storyboard, the probe, the render and re-voice stages, and the install lines. The video has a subtitle track that is off by default.

The storyboards are in [`demos/`](https://github.com/williamthorsen/workshop/tree/main/packages/demo-tools/demos). To render the video from a clone, run these from `packages/demo-tools`. The inner demo renders first, because the outer demo plays its video and shows its stills:

```bash
pnpm run demo:serve &
unset OPENAI_API_KEY OPENAI_BASE_URL AIDEMO_OPENAI_BASE_URL
export AIDEMO_TTS_PROVIDER=local
pnpm exec aidemo render demos/sample-tour --headless --fresh
pnpm exec aidemo render demos/agent-records-demo --headless --fresh
```

[aidemo's README](https://github.com/tandryukha/aidemo#readme) describes the options. In the outer storyboard, a scene that plays the video leaves its page with two `goto` actions on purpose: Chrome's screencast stalls after one navigation away from a playing video, and the second navigation restarts it.

`demos/what-thor-demo-adds` renders a video, about a minute long, that shows the per-repository configuration, the archived takes, and the voice clone, each as the problem that it solves and then its solution. To render it from a clone, run these from `packages/demo-tools` after `nmr build`:

```bash
pnpm run demo:serve &
node bin/thor-demo.js render what-thor-demo-adds --headless --strict
```

## Captions

Each render writes `output/final-demo.srt` and `output/final-demo.vtt` beside the video. To deliver the captions as a subtitle track, off by default, rather than burned into the frames, set this in the demo's storyboard:

```json
"captions": { "style": "none", "track": true }
```

## Archiving takes

After each successful `render` or `revoice`, `thor-demo` copies the take into an archive, so that the next render does not overwrite it. The archive root is set per machine, in `~/.config/thor-demo/config.yaml`:

```yaml
archive:
  # An absolute path. Expands ${VAR} and a leading ~, like aidemo.env.
  root: ~/Videos/demos
```

`THOR_DEMO_ARCHIVE_ROOT`, an absolute path, overrides the file. Without either, the render still runs, and `thor-demo` reports that the take was not archived. A malformed file stops `render` before aidemo runs.

Each take is a directory of its own:

```
<archive root>/<archive.label>/<demo>/<YYYYMMDD-HHMMSSZ>_<commit>[-dirty]/
  final-demo.mp4  final-demo.srt  final-demo.vtt  report.json  provenance.json
```

The timestamp is the UTC time at which the render started, and `<commit>` is the demo repository's short commit, with `-dirty` when the work tree had changes or untracked files; outside a git work tree, the suffix is `nogit`. The caption files and `report.json` are archived when the render wrote them. An archive root inside the demo repository, or an `output/` directory that the repository does not ignore, marks every later take `-dirty`.

`provenance.json` records what produced the take:

| Field           | Content                                                                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | `2`                                                                                                                                                                                     |
| `demo`, `label` | The demo's name and `archive.label`                                                                                                                                                     |
| `renderedAt`    | The render's start, as ISO 8601                                                                                                                                                         |
| `source`        | The `commit` and `dirty` state before the render, or `null` for each outside git                                                                                                        |
| `engine`        | The aidemo package and version                                                                                                                                                          |
| `voice`         | Each scene's `id`, TTS `provider`, and `voiceId` in `scenes`, as aidemo's `audio/voice.json` records them, or `null` where it does not; for a `revoice` take, `mlx-audio` and the model |
| `reference`     | For a `revoice` take only, the `sha256` of the reference recording that it clones                                                                                                       |
| `params`        | The options passed to aidemo after the demo                                                                                                                                             |
| `storyboard`    | The `sha256` of `generated/storyboard.json`                                                                                                                                             |
| `files`         | Each archived file's `sha256` and size in `bytes`, which match the file in `output/`                                                                                                    |

The record contains no environment values. Renders with `--lang`, `--langs`, or `--variants` write files named for each language and are not archived. When archiving fails, as it does when aidemo wrote no `audio/voice.json`, `render` exits 1 and the take remains in the demo's `output/`.

## Voice clone

`thor-demo voice setup` installs a voice clone that speaks any text in the voice of a reference recording, and `thor-demo revoice` narrates a recorded demo with it, so that a demo is narrated in its presenter's voice without the narration or the recording leaving the machine.

It requires Apple Silicon, [uv](https://docs.astral.sh/uv/), and ffmpeg:

```bash
brew install uv ffmpeg
```

The voice is set per machine, in `~/.config/thor-demo/config.yaml`, because the recording is personal and a demo repository may be public:

```yaml
voice:
  home: ~/.local/share/thor-demo/voice # optional; absolute after expansion
  model: mlx-community/higgs-audio-v2-3B-mlx-q8 # optional
  reference:
    audio: ~/Voice/reference.m4a # required; absolute after expansion; voice record writes it
    transcript: ~/Voice/reference.txt # required; a file containing exactly what the recording says
```

Paths expand `${VAR}` and a leading `~`, like `archive.root`. `voice.model` may name any model in [mlx-audio's model list](https://github.com/Blaizzy/mlx-audio#supported-models) that clones from a reference recording and its transcript.

### Recording the reference

Write a paragraph of three or four sentences to `voice.reference.transcript`, then record the presenter reading it:

```bash
thor-demo voice microphones
thor-demo voice record --microphone "MacBook Pro Microphone"
```

`voice record` prints the transcript, records until Enter is pressed, saves the take to `voice.reference.audio` in the format that its extension names, keeping the previous take beside it, then reports the take's loudness and plays it back. It compiles a small recorder on first use, which needs the Xcode Command Line Tools (`xcode-select --install`); ffmpeg's own capture drops audio on macOS, which leaves clicks in a take.

Aim for 10 to 30 seconds read in a quiet room, in the tone wanted for narration, with the microphone close. If a word comes out differently, edit the transcript to match what was said.

### Setting up

```bash
thor-demo voice setup
```

Under `voice.home`, setup creates a Python virtual environment with a pinned mlx-audio, downloads the model into `models/` and any repository that it loads besides its own into the Hugging Face cache in `hf/`, and builds a voice profile in `profile/`: the recording converted to mono WAV and the transcript. It then verifies the install by starting mlx-audio's server on 127.0.0.1 with Hugging Face's offline mode on, synthesizing a phrase in the cloned voice to `verify.mp3`, and stopping the server. It prints that file's path; listen to it to judge the clone.

Installing and downloading are the only steps that use the network. A rerun skips each step whose inputs are unchanged and verifies again; a changed recording or transcript rebuilds the profile, and a changed model downloads it and rebuilds the profile.

### Re-voicing a demo

```bash
thor-demo render quickstart
thor-demo revoice quickstart
```

`revoice` keeps the demo's last recording and replaces its narration: It starts the voice-clone server offline on 127.0.0.1, runs aidemo's `voice`, `captions`, and `compose` stages with each speech request sent through a proxy on 127.0.0.1 that adds the voice profile, stops the server, and archives the take as `render` does. Captions are timed from the script, because the clone does not transcribe. Every revoice re-voices every scene.

The proxy measures each clip with ffmpeg before aidemo receives it. It refuses a clip that is silent throughout, one that ends in more than 3 s of silence, and one whose speech is far shorter than its text requires, and it abandons a request that the server does not answer within 9 minutes. `revoice` then stops, naming the scene's text, the reason, and the voice-clone server's log; it does not retry. A clip that has normal levels but sounds wrong passes these checks.

It refuses to start when the profile does not match the voice section, when the demo has not been rendered, or when the repository's `.env` sets a variable that would send the narration elsewhere. `thor-demo revoice --help` names each prerequisite.

The cloned voice ignores the storyboard's `voice.speed` and `voice.instructions`. A later `render` re-voices the demo in its configured voice, because aidemo keys its voice cache by the TTS server and model.
