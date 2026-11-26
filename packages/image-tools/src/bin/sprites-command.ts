import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { CliError, type Command, createCli, type Writer } from '@williamthorsen/toolbelt.cli/candidate';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { encodePng } from '../sprites/encode-png.ts';
import { formatSpriteCss } from '../sprites/format-sprite-css.ts';
import { MAX_PALETTE_ENTRIES, parseSpriteSheet } from '../sprites/parse-sprite-sheet.ts';
import type { RunEffects } from './run.ts';

const { defineCommand } = createCli<RunEffects>();

/** Defines the `sprites` command. */
export function defineSpritesCommand(): Command<RunEffects> {
  return defineCommand({
    summary: 'Render coded pixel art to PNG sprite strips and CSS',
    description: `Read a JSON file of a palette and sprites, render each sprite's frames left to right as one PNG strip, and print a CSS rule per sprite that embeds the strip and sets --frames and --last-x for a steps() animation. The palette maps one printable ASCII character to #rrggbb, or to null for a transparent pixel, with at most ${MAX_PALETTE_ENTRIES} entries. Each sprite, named by [a-z0-9-]+, lists its frames, and each frame lists its rows of palette characters, top to bottom. Rendering needs neither Apple Silicon nor uv.`,
    operands: [{ name: 'data-file', description: 'The JSON file of palette and sprites' }],
    flags: {
      pngDir: {
        type: 'path',
        description: 'A directory to which to also write each strip as <sprite>.png',
        valueHint: 'dir',
      },
    },
    examples: [
      { description: 'Print the CSS of every sprite', command: '{invocation} sprites.json > sprites.css' },
      {
        description: 'Also write each strip to a PNG file',
        command: '{invocation} sprites.json --png-dir ./sprites > sprites.css',
      },
    ],
    run: ({ context, flags, operands, stdout }) =>
      runSprites(context, { dataFile: operands['data-file'], pngDir: flags.pngDir }, stdout),
  });
}

// region | Helpers

/** Names a filesystem error by its code, such as `ENOENT`, or by its message when it lacks one. */
function describeFileError(error: unknown): string {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : describeError(error);
}

/** Runs `sprites`: parses the data file, writes the PNG files when asked, and prints the CSS. */
function runSprites(
  effects: RunEffects,
  options: { dataFile: string; pngDir: string | undefined },
  stdout: Writer,
): number {
  let text: string;
  try {
    text = readFileSync(path.resolve(effects.cwd, options.dataFile), 'utf8');
  } catch (error) {
    throw new CliError(`cannot read ${options.dataFile}: ${describeFileError(error)}`);
  }

  const parsed = parseSpriteSheet(text);
  if (!parsed.ok) {
    throw new CliError(
      `the sprite data in ${options.dataFile} is invalid:\n${parsed.problems.map((problem) => `  ${problem}`).join('\n')}`,
    );
  }

  const { palette, sprites } = parsed.sheet;
  const strips = sprites.map((sprite) => ({ png: encodePng(sprite, palette), sprite }));
  if (options.pngDir !== undefined) writeStrips(options.pngDir, strips);
  stdout.write(strips.map(({ png, sprite }) => formatSpriteCss(sprite, png)).join('\n'));
  return 0;
}

/** Writes each strip to `<dir>/<sprite>.png`, creating the directory when absent. */
function writeStrips(dir: string, strips: readonly { png: Buffer; sprite: { name: string } }[]): void {
  let target = dir;
  try {
    mkdirSync(dir, { recursive: true });
    for (const { png, sprite } of strips) {
      target = path.join(dir, `${sprite.name}.png`);
      writeFileSync(target, png);
    }
  } catch (error) {
    throw new CliError(`cannot write ${target}: ${describeFileError(error)}`);
  }
}

// endregion | Helpers
