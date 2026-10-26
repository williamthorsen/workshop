/** The deck's script: the kit models and their rendering through readyup's own formatters. */

// eslint-disable-next-line sky-pilot/no-unpublished-barrel -- The entry of `deck.js`, whose IIFE exposes these exports as `ReadyupDeck`.
export { KITS } from './kits.ts';
export { renderDeployRun, renderKit, renderTitleRun } from './renderKit.ts';
export { toHtml } from './toHtml.ts';
