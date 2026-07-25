import { emojiFormatter } from './emojiFormatter.ts';
import { createLayoutEngine, type LayoutEngine } from './layoutEngine.ts';

/**
 * The engine every command renders through.
 *
 * One shared instance because emoji is the only vocabulary the CLI can currently select. The
 * follow-up that adds a text formatter replaces this constant with a per-invocation choice, which is
 * why call sites take their geometry from the engine rather than reaching for a formatter directly.
 */
export const layout: LayoutEngine = createLayoutEngine(emojiFormatter);
