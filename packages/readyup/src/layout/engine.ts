import type { OutputStyle } from '@williamthorsen/toolbelt.terminal/candidate';

import { plainFormatter, richColorFormatter, richFormatter } from './formatter.ts';
import { createLayoutEngine, type LayoutEngine } from './layoutEngine.ts';

/** One engine per style, each bound to that style's vocabulary. */
const engines: Record<OutputStyle, LayoutEngine> = {
  plain: createLayoutEngine(plainFormatter),
  rich: createLayoutEngine(richFormatter),
};

/** The rich engine whose vocabulary includes colour. Plain output is never coloured. */
const richColorEngine = createLayoutEngine(richColorFormatter);

/**
 * The engine through which every command renders, rich until an invocation selects otherwise.
 *
 * The default is a fixed style rather than a detected one. Detection belongs to the invocation, so
 * anything rendering without one -- a test formatting a report directly, say -- gets one style rather
 * than one that changes with the terminal under which it happens to run.
 */
let active: LayoutEngine = engines.rich;

/** The style to which `active` is bound. */
let activeStyle: OutputStyle = 'rich';

/**
 * Whether `active` colours rich output, off until an invocation resolves it.
 *
 * Off for the reason that the default style is fixed: Anything rendering without an invocation gets output that
 * does not change with the environment under which it happens to run.
 */
let activeColor = false;

/**
 * Width to which every render fits, unlimited until an invocation resolves one.
 *
 * Unlimited for the reason that the default style is fixed: Anything rendering without an invocation gets
 * output that does not change with the terminal under which it happens to run.
 */
let activeWidth = Infinity;

/** Returns whether rich output is coloured. */
export function getColor(): boolean {
  return activeColor;
}

/** Returns the engine bound to the selected style. */
export function getLayout(): LayoutEngine {
  return active;
}

/** Returns the selected style. */
export function getStyle(): OutputStyle {
  return activeStyle;
}

/** Returns the width to which output fits, `Infinity` meaning no limit. */
export function getWidth(): number {
  return activeWidth;
}

/** Colours every later render under the rich style when `enabled`. */
export function setColor(enabled: boolean): void {
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- The colour is a process singleton.
  activeColor = enabled;
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- The engine is a process singleton.
  active = resolveEngine();
}

/** Binds every later render to `style`. */
export function setStyle(style: OutputStyle): void {
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- The style is a process singleton.
  activeStyle = style;
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- The engine is a process singleton.
  active = resolveEngine();
}

/** Fits every later render to `width`. */
export function setWidth(width: number): void {
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- The width is a process singleton.
  activeWidth = width;
}

// region | Helpers

/** Returns the engine for the selected style and colour. */
function resolveEngine(): LayoutEngine {
  return activeStyle === 'rich' && activeColor ? richColorEngine : engines[activeStyle];
}

// endregion | Helpers
