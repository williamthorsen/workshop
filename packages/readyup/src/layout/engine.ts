import { createLayoutEngine, type LayoutEngine } from './layoutEngine.ts';
import { plainFormatter } from './plainFormatter.ts';
import type { Style } from './resolveStyle.ts';
import { richFormatter } from './richFormatter.ts';

/** One engine per style, each bound to that style's vocabulary. */
const engines: Record<Style, LayoutEngine> = {
  plain: createLayoutEngine(plainFormatter),
  rich: createLayoutEngine(richFormatter),
};

/**
 * The engine every command renders through, rich until an invocation selects otherwise.
 *
 * The default is a fixed style rather than a detected one. Detection belongs to the invocation, so
 * anything rendering without one -- a test formatting a report directly, say -- gets one answer rather
 * than one that changes with the terminal it happens to run under.
 */
let active: LayoutEngine = engines.rich;

/** Returns the engine bound to the selected style. */
export function getLayout(): LayoutEngine {
  return active;
}

/** Binds every later render to `style`. */
export function setStyle(style: Style): void {
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- The engine is a process singleton.
  active = engines[style];
}
