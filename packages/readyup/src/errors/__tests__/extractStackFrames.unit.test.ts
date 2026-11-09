import { describe, expect, it } from 'vitest';

import { extractStackFrames } from '../extractStackFrames.ts';

describe(extractStackFrames, () => {
  it('returns the frame lines of an error', () => {
    const frames = extractStackFrames(new Error('boom'));

    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) expect(frame).toMatch(/^\s+at /);
  });

  it('keeps every line of a multi-line message out of the frames', () => {
    const frames = extractStackFrames(new Error('first line\nsecond line'));

    expect(frames.join('\n')).not.toContain('second line');
  });

  it('returns no frames for an error without a stack', () => {
    const error = new Error('boom');
    delete error.stack;

    expect(extractStackFrames(error)).toStrictEqual([]);
  });

  it('returns no frames for a value that is not an error', () => {
    expect(extractStackFrames('boom')).toStrictEqual([]);
  });
});
