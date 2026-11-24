/** An image size in pixels. */
export interface Size {
  readonly height: number;
  readonly width: number;
}

/** The largest seed that mflux accepts, which is also the upper bound of a drawn seed. */
export const MAX_SEED = 2 ** 32 - 1;

/** The multiple of which each side of an image must be, as Qwen-Image 2.1's latents require. */
export const SIZE_STEP = 32;

/** Parses a `--seed` value, throwing a message that names the accepted range. */
export function parseSeed(raw: string): number {
  const seed = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(seed) || seed > MAX_SEED) {
    throw new Error(`a seed is an integer from 0 to ${MAX_SEED}, not ${raw}`);
  }
  return seed;
}

/** Parses a `--size` value written as `WIDTHxHEIGHT`, throwing a message that names the accepted form. */
export function parseSize(raw: string): Size {
  const [, width, height] = (/^(\d+)x(\d+)$/.exec(raw) ?? []).map(Number);
  if (
    width === undefined ||
    height === undefined ||
    [width, height].some((side) => side === 0 || side % SIZE_STEP !== 0)
  ) {
    throw new Error(`a size is WIDTHxHEIGHT in positive multiples of ${SIZE_STEP}, such as 1024x768, not ${raw}`);
  }
  return { height, width };
}
