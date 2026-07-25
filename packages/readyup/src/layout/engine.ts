import { emojiFormatter } from './emojiFormatter.ts';
import { createLayoutEngine, type LayoutEngine } from './layoutEngine.ts';

/** The layout engine bound to the emoji formatter. */
export const layout: LayoutEngine = createLayoutEngine(emojiFormatter);
