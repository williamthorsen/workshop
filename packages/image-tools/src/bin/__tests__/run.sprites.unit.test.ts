import { existsSync, readFileSync } from 'node:fs';

import { createTextBuffer } from '@williamthorsen/toolbelt.cli/candidate';
import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { decodePng } from '../../sprites/test-utils/decode-png.ts';
import { run } from '../run.ts';
import { buildRunEffects } from '../test-utils/build-run-effects.ts';

const SPRITES = JSON.stringify({
  palette: { '.': null, k: '#1d1b26', b: '#1868db' },
  sprites: {
    'hero-walk': {
      frames: [
        ['.kk.', 'kbbk'],
        ['.bb.', 'kkkk'],
      ],
    },
    coin: { frames: [['b']] },
  },
});

describe('thor-image sprites', () => {
  it('prints a CSS rule per sprite in file order, on a machine without Apple Silicon', async () => {
    using tree = createTempTree({ 'sprites.json': SPRITES });

    const result = await runSprites(tree, ['sprites.json']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(
      /^\.sprite-hero-walk \{\n {2}width: 4px;\n {2}height: 2px;\n {2}background: url\(data:image\/png;base64,[A-Za-z0-9+/=]+\) 0 0 \/ 8px 2px no-repeat;\n {2}--frames: 2;\n {2}--last-x: -4px;\n\}\n\n\.sprite-coin \{\n/,
    );
    expect(result.stdout).toMatch(/--frames: 1;\n {2}--last-x: 0px;\n\}\n$/);
  });

  it('writes each strip under --png-dir with the bytes that the CSS embeds', async () => {
    using tree = createTempTree({ 'sprites.json': SPRITES });

    const result = await runSprites(tree, ['sprites.json', '--png-dir', 'out/png']);

    const png = readFileSync(tree.resolve('out/png/hero-walk.png'));
    expect(result.stdout).toContain(`base64,${png.toString('base64')})`);
    expect(decodePng(png).rows).toStrictEqual([
      [0, 1, 1, 0, 0, 2, 2, 0],
      [1, 2, 2, 1, 1, 1, 1, 1],
    ]);
    expect(existsSync(tree.resolve('out/png/coin.png'))).toBe(true);
  });

  it('reports a file that it cannot read', async () => {
    using tree = createTempTree({});

    await expect(runSprites(tree, ['absent.json'])).resolves.toStrictEqual({
      exitCode: 1,
      stderr: 'thor-image: cannot read absent.json: ENOENT\n',
      stdout: '',
    });
  });

  it('reports every problem in an invalid file and writes no PNG file', async () => {
    using tree = createTempTree({
      'sprites.json': JSON.stringify({
        palette: { k: '#000000' },
        sprites: { a: { frames: [['kk'], ['kx']] }, B: { frames: [['k']] } },
      }),
    });

    const result = await runSprites(tree, ['sprites.json', '--png-dir', 'out']);

    expect(result).toStrictEqual({
      exitCode: 1,
      stderr: [
        'thor-image: the sprite data in sprites.json is invalid:',
        '  sprite "a", frame 2, row 1, column 2: "x" is not in the palette',
        '  sprite "B": the name must match [a-z0-9-]+',
        '',
      ].join('\n'),
      stdout: '',
    });
    expect(existsSync(tree.resolve('out'))).toBe(false);
  });

  it('reports a --png-dir that it cannot write', async () => {
    using tree = createTempTree({ 'sprites.json': SPRITES, taken: 'a file' });

    const result = await runSprites(tree, ['sprites.json', '--png-dir', 'taken']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(`thor-image: cannot write ${tree.resolve('taken')}: EEXIST\n`);
    expect(result.stdout).toBe('');
  });

  it('documents the format in its help', async () => {
    using tree = createTempTree({});

    const result = await runSprites(tree, ['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--png-dir');
    expect(result.stdout).toContain('null for a transparent pixel');
  });
});

// region | Helpers

/** Runs `thor-image sprites` with `args` in `tree`, collecting what it writes to each stream. */
async function runSprites(
  tree: TempTree,
  args: string[],
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const stdout = createTextBuffer();
  const stderr = createTextBuffer();
  const effects = buildRunEffects({ arch: 'x64', cwd: tree.resolve('.'), platform: 'linux' });
  const exitCode = await run(['sprites', ...args], effects, { stderr, stdout });
  return { exitCode, stderr: stderr.text, stdout: stdout.text };
}

// endregion | Helpers
