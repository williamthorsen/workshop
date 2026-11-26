import type { Sprite } from './parse-sprite-sheet.ts';

/**
 * Formats the CSS rule that shows `sprite` from its PNG strip, with `--frames` and `--last-x`, the offset of the last
 * frame, for a `steps()` animation that rests on that frame.
 */
export function formatSpriteCss(sprite: Sprite, png: Buffer): string {
  const frameCount = sprite.frames.length;
  const stripWidth = frameCount * sprite.width;
  const lastX = (1 - frameCount) * sprite.width;
  return [
    `.sprite-${sprite.name} {`,
    `  width: ${sprite.width}px;`,
    `  height: ${sprite.height}px;`,
    `  background: url(data:image/png;base64,${png.toString('base64')}) 0 0 / ${stripWidth}px ${sprite.height}px no-repeat;`,
    `  --frames: ${frameCount};`,
    `  --last-x: ${lastX}px;`,
    '}',
    '',
  ].join('\n');
}
