<!-- readme-type: cli -->

# @williamthorsen/image-tools

A CLI that renders a subject in named visual styles with open-weight image models, locally on Apple Silicon, and renders coded pixel art to PNG sprite strips and CSS.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add -g @williamthorsen/image-tools
```

Node 24 or later is required, and is all that `thor-image sprites` needs. `thor-image generate` also requires a Mac with Apple Silicon and [uv](https://docs.astral.sh/uv/) (`brew install uv`), which runs [mflux](https://github.com/filipstrand/mflux) on demand. The first run of a model downloads its weights from Hugging Face, which takes tens of gigabytes of disk.

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

## Sprites

`thor-image sprites` renders pixel art written as text to one PNG strip per sprite, and prints a CSS rule per sprite on stdout:

```bash
thor-image sprites sprites.json --png-dir ./sprites > sprites.css
```

`--png-dir` also writes each strip to `<dir>/<sprite>.png`; without it, the CSS alone carries the strips as data URIs. The data file declares a palette and the sprites:

```json
{
  "palette": { ".": null, "k": "#1d1b26", "b": "#1868db" },
  "sprites": {
    "hero-walk": { "frames": [[".kk.", "kbbk"], [".bb.", "kkkk"]] }
  }
}
```

- `palette` maps one printable ASCII character to `#rrggbb`, or to `null` for a transparent pixel, with at most 16 colours; `null` entries do not count toward the limit.
- `sprites` maps a name matching `[a-z0-9-]+` to its `frames`. Each frame lists its rows, top to bottom, of palette characters. Every row of a sprite has the same length, and every frame the same number of rows. A still image is a sprite with one frame.

Each rule sizes the element to one frame and the background to the strip, at one CSS pixel per pixel of art:

```css
.sprite-hero-walk {
  width: 4px;
  height: 2px;
  background: url(data:image/png;base64,…) 0 0 / 8px 2px no-repeat;
  --frames: 2;
  --last-x: -4px;
}
```

`--last-x` is the offset of the last frame. To play a sprite of two or more frames once and rest on its last frame, rest the element at `var(--last-x) 0` and animate from `0 0`; `jump-none` makes the first and last steps show the first and last frames:

```css
.sprite-hero-walk {
  background-position: var(--last-x) 0;
  animation: play 0.4s steps(var(--frames), jump-none);
  image-rendering: pixelated;
}

@keyframes play {
  from {
    background-position: 0 0;
  }
}
```

`steps()` needs at least two steps with `jump-none`, so a one-frame sprite is shown without the animation. To enlarge a sprite, scale it with `transform: scale()` or `zoom`; `image-rendering: pixelated` keeps its edges sharp.
