import { isRecord } from '../isRecord.ts';
import { compareVersions } from './semver.ts';

/** Outcome of reading a manifest's `engines.node`. */
export type EnginesNodeFloor =
  /** A simple floor form was recognized; `floor` is the version it names. */
  | { kind: 'found'; floor: string; raw: string }
  /** No `engines.node` string is declared. */
  | { kind: 'absent' }
  /** A range was declared, but not in a form from which a single floor follows. */
  | { kind: 'unparseable'; raw: string };

/** Matches the simple floor forms: `>=x[.y[.z]]`, `^x[.y[.z]]`, and a bare `x[.y[.z]]`. */
const SIMPLE_FLOOR = /^(?:>=|\^)?\s*(\d+(?:\.\d+){0,2})$/;

/**
 * Reads the minimum Node version a parsed manifest declares in `engines.node`.
 * Ranges outside the simple floor forms are reported as unparseable rather than guessed at.
 */
export function readEnginesNodeFloor(manifest: Record<string, unknown>): EnginesNodeFloor {
  const engines = manifest.engines;
  if (!isRecord(engines)) return { kind: 'absent' };
  const raw = engines.node;
  if (typeof raw !== 'string') return { kind: 'absent' };

  const floor = SIMPLE_FLOOR.exec(raw.trim())?.[1];
  if (floor === undefined) return { kind: 'unparseable', raw };
  return { kind: 'found', floor, raw };
}

/**
 * Reports whether a Node version is at or above a floor.
 * A leading `v` is tolerated on either argument, so `process.version` can be passed as it comes.
 */
export function satisfiesNodeFloor(version: string, floor: string): boolean {
  return compareVersions(normalizeVersion(version), normalizeVersion(floor)) >= 0;
}

// region | Helpers

/** Trims a version string and strips the leading `v` that Node's own version carries. */
function normalizeVersion(version: string): string {
  const trimmed = version.trim();
  return trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
}

// endregion | Helpers
