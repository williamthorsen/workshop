import type { OutputStyle } from '@williamthorsen/toolbelt.terminal/candidate';

import { createLayoutEngine, type LayoutEngine } from './layoutEngine.ts';
import { plainFormatter } from './plainFormatter.ts';
import { richFormatter } from './richFormatter.ts';

/** One engine per style, each bound to that style's vocabulary. */
const engines: Record<OutputStyle, LayoutEngine> = {
  plain: createLayoutEngine(plainFormatter),
  rich: createLayoutEngine(richFormatter),
};

/**
 * The engine through which every command renders, rich until an invocation selects otherwise.
 *
 * The default is a fixed style rather than a detected one. Detection belongs to the invocation, so
 * anything rendering without one -- a test formatting a report directly, say -- gets one style rather
 * than one that changes with the terminal under which it happens to run.
 */
let active: LayoutEngine = engines.rich;

/** Returns the engine bound to the selected style. */
export function getLayout(): LayoutEngine {
  return active;
}

/** Binds every later render to `style`. */
export function setStyle(style: OutputStyle): void {
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- The engine is a process singleton.
  active = engines[style];
}
