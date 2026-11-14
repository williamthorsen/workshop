import { render, type Renderers } from '@williamthorsen/readout';

import { formatIsoTimestamp } from '../portable/date-formats.ts';
import type { JsonValue, ThorChromeRefusal } from './invocation.ts';
import { deriveRecordedPort } from './profiles.ts';
import type { ProfileEntry, ProfileOutcome, ProfileOutcomes, VerbResult, VerbResults } from './results.ts';

interface JsonObject {
  [key: string]: JsonValue;
}

/** The states in which a profile has a running browser, whose mode a report names. */
const RUNNING_STATES: ReadonlySet<ProfileEntry['state']> = new Set([
  'debugging',
  'running-without-port',
  'unresponsive',
]);

const OUTCOME_RENDERERS: Renderers<ProfileOutcomes, JsonObject> = {
  deleted: ({ entry }) => renderProfileJson(entry),
  quit: ({ entry }) => renderProfileJson(entry),
  refused: ({ entry, error }) => ({ ...renderProfileJson(entry), error }),
  retained: ({ entry }) => ({ ...renderProfileJson(entry), retained: 'running' }),
};

const RESULT_RENDERERS: Renderers<VerbResults, JsonValue> = {
  delete: ({ isDryRun, outcomes }) =>
    isDryRun ? { profiles: renderOutcomes(outcomes), dryRun: true } : { profiles: renderOutcomes(outcomes) },
  launch: ({ browser, entry }) => ({ profile: renderProfileJson(entry), browser }),
  'launch-plan': ({ command, pages }) => ({
    command: command === undefined ? null : [...command],
    pages: [...pages],
    dryRun: true,
  }),
  list: ({ entries = [] }) => ({ profiles: entries.map((entry) => renderProfileJson(entry)) }),
  quit: ({ outcomes }) => ({ profiles: renderOutcomes(outcomes) }),
  'quit-idle': ({ outcomes }) => ({ profiles: renderOutcomes(outcomes) }),
  'show-instance-page': ({ entry, page }) => ({ profile: renderProfileJson(entry), page }),
  status: ({ endpoint, entry }) => ({ profile: renderProfileJson(entry), endpoint }),
};

/**
 * Returns one profile as a JSON object.
 *
 * The endpoint is reported only in state `debugging`. One that does not answer is not an endpoint, and a URL beside any
 * other state would invite a caller to use it. `headless` is null in every state without a running browser.
 */
export function renderProfileJson(entry: ProfileEntry): JsonObject {
  const { facts } = entry;
  const devtools = entry.state === 'debugging' ? `http://127.0.0.1:${entry.port ?? ''}/json/version` : undefined;
  return {
    name: entry.name,
    path: entry.path,
    state: entry.state,
    headless: RUNNING_STATES.has(entry.state) ? (entry.isHeadless ?? null) : null,
    pid: toNumber(entry.pid),
    port: toNumber(entry.port),
    derivedPort: deriveRecordedPort(facts) ?? null,
    devtools: devtools ?? null,
    origin: facts.origin ?? null,
    repo: facts.repo ?? null,
    branch: facts.branch ?? null,
    stale: facts.stale ?? null,
    lastUsedAt: facts.lastUsed === undefined ? null : formatIsoTimestamp(facts.lastUsed),
  };
}

/** Returns a refusal of the whole invocation as one document, with the refused profile beside the error when known. */
export function renderRefusalJson(refusal: ThorChromeRefusal, entry: ProfileEntry | undefined): JsonValue {
  const document: JsonObject = { error: { code: refusal.code, message: refusal.message, ...refusal.extra } };
  if (entry !== undefined) document['profile'] = renderProfileJson(entry);
  return document;
}

/** Returns a verb's result as one JSON document. */
export function renderResultJson(result: VerbResult): JsonValue {
  return render(result, RESULT_RENDERERS);
}

// region | Helpers

/** Returns each per-profile outcome as its profile's JSON object. */
function renderOutcomes(outcomes: readonly ProfileOutcome[]): JsonValue[] {
  return outcomes.map((outcome) => render(outcome, OUTCOME_RENDERERS));
}

/** Returns a numeric string as a number, or `null` when it is unset. */
function toNumber(value: string | undefined): number | null {
  return value === undefined || value === '' ? null : Number(value);
}

// endregion | Helpers
