<!-- readme-type: cli -->

# @williamthorsen/image-tools

A CLI that renders a subject in named visual styles with open-weight image models, locally on Apple Silicon.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add -g @williamthorsen/image-tools
```

Node 24 or later is required. Rendering also requires a Mac with Apple Silicon and [uv](https://docs.astral.sh/uv/) (`brew install uv`), which runs [mflux](https://github.com/filipstrand/mflux) on demand. The first run of a model downloads its weights from Hugging Face, which takes tens of gigabytes of disk.

## Usage

```bash
thor-image generate "a lighthouse in a storm" --style oil --style engraving
```

Each style is a prompt template from [`catalogue/styles.yaml`](./catalogue/styles.yaml), into which the subject is placed. Render every style, with two seeds each:

```bash
thor-image generate "a fox in the snow" --style all --seed 1 --seed 2
```

Restyle an existing picture by passing it as a reference image, which routes the run to the model's edit variant:

```bash
thor-image generate "the same scene" --style watercolor --reference ./scene.png
```

Preview the prompts without rendering by adding `--dry-run`. `thor-image generate --help` lists every option and style.

## Output

Each run writes its images to its own directory, `./thor-image/<timestamp>/<style>-<seed>.png` by default, and `run.json` beside them. The record states, per image, the model, its licence, the mflux version, the full prompt, the seed, and the settings, so that any image can be reproduced. `--json` prints the same record on stdout.

## Models

`--model` selects one of two models:

- `qwen-image-2.1-turbo` (default): the stronger prompt adherence, and the only one that takes reference images. Its weights are published under the Qwen Research License, which does not permit commercial use.
- `z-image-turbo`: published under Apache 2.0.

Both run without classifier-free guidance, so a style's `negative_prompt` does not change their output; a style excludes things by what its `prompt` says.
