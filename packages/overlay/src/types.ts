/** The convergence mode overlay runs in. */
export type OverlayMode = 'verify' | 'create' | 'force';

/** Options accepted by the `overlay()` core. */
export interface OverlayOptions {
  source: string;
  target?: string;
  mode?: OverlayMode;
}

/** What happened (or would happen) to a single managed entry. */
export type EntryOutcome = 'created' | 'deleted' | 'forced' | 'conflict';

/** A single managed entry and its outcome. */
export interface OverlayEntry {
  path: string;
  outcome: EntryOutcome;
}

/** Summary of `run_` script execution. `ran` is the number of pending/run scripts; `ok` is false only if execution failed. */
export interface ScriptsSummary {
  ran: number;
  ok: boolean;
}

/**
 * Mode-relative tallies. Under `verify` they count pending drift; under
 * `create`/`force` they count what was actually done. `conflicts` is always
 * `0` under `force`.
 */
export interface OverlayCounts {
  created: number;
  deleted: number;
  forced: number;
  conflicts: number;
  pending: number;
}

/** The structured result of an overlay run — never printed text. */
export interface OverlayResult {
  mode: OverlayMode;
  entries: OverlayEntry[];
  scripts: ScriptsSummary;
  counts: OverlayCounts;
  exitCode: 0 | 1 | 2;
}
