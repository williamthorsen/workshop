import { createLayoutEngine, type LayoutEngine } from './layoutEngine.ts';
import { richFormatter } from './richFormatter.ts';

/** The layout engine bound to the rich formatter. */
export const layout: LayoutEngine = createLayoutEngine(richFormatter);
