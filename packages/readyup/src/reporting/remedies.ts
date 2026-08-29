/**
 * Remedy text shared by the commands that report a kit's staleness.
 *
 * `rdy verify` enforces, whereas `rdy run` advises; the two must reach the same verdicts and give the same advice.
 */

/** The remedy for a bundle whose recorded hash no longer describes it, which only `--force` recompiles. */
export const MOVE_EDITS_REMEDY = 'Move the edits into the source, then run `rdy compile --force`.';

/** The remedy every axis reaches where a plain recompile settles what it found. */
export const RECOMPILE_REMEDY = 'Run `rdy compile` to rebuild it.';
