import { isError } from '@williamthorsen/toolbelt.errors';

/** Matches one stack frame line, as V8 writes it beneath the error's header. */
const STACK_FRAME_PATTERN = /^\s+at /;

/**
 * Returns the stack frame lines of an unknown thrown value, or none when it is not an error or has no stack.
 *
 * Frames are selected by their own shape rather than by stripping the header, because a message that spans
 * several lines makes the header span several lines too.
 */
export function extractStackFrames(error: unknown): string[] {
  if (!isError(error) || typeof error.stack !== 'string') return [];
  return error.stack.split('\n').filter((line) => STACK_FRAME_PATTERN.test(line));
}
