import type { ProfileStateName } from './browser-process.ts';
import type { ProfileFacts } from './profiles.ts';

/** A profile as a report shows it: the state in which the verb found or left it, and what the profile recorded. */
export interface ProfileEntry {
  facts: ProfileFacts;
  /** Whether the profile's browser runs headless, unset when no browser was found. */
  isHeadless: boolean | undefined;
  /** Whether the repository that a stale profile recorded still exists, which tells what made it stale. */
  isRepoPresent: boolean | undefined;
  name: string;
  path: string;
  pid: string | undefined;
  port: string | undefined;
  state: ProfileStateName | 'deleted';
}

/** A profile that a delete removed, or that a dry run would remove. */
export interface DeletedOutcome {
  entry: ProfileEntry;
  isDryRun: boolean;
  type: 'deleted';
}

/** A profile that a quit left stopped: one that it ended, or one that was not running. */
export interface QuitOutcome {
  entry: ProfileEntry;
  /** Whether `quit --idle` ended the browser for having no client. */
  isIdle: boolean;
  type: 'quit';
}

/** A profile that the verb could not act on, which does not stop the verb from acting on the rest. */
export interface RefusedOutcome {
  entry: ProfileEntry;
  error: { code: string; message: string };
  hints: readonly string[];
  type: 'refused';
}

/** A running profile that a sweep kept. */
export interface RetainedOutcome {
  entry: ProfileEntry;
  type: 'retained';
}

/** What a verb that acts on several profiles did with one of them. */
export type ProfileOutcome = DeletedOutcome | QuitOutcome | RefusedOutcome | RetainedOutcome;

/** Each per-profile outcome by its type. */
export interface ProfileOutcomes {
  deleted: DeletedOutcome;
  quit: QuitOutcome;
  refused: RefusedOutcome;
  retained: RetainedOutcome;
}

/** Receives each per-profile outcome as soon as the verb reaches it. */
export type OutcomeObserver = (outcome: ProfileOutcome) => void;

/** The profiles that a delete acts on. */
export type DeleteSelection = 'all' | 'derived' | 'profile' | 'stale';

export interface DeleteResult {
  isDryRun: boolean;
  /** The directory of the working directory's derived profile when `--derived` found none there. */
  missingDerivedDir: string | undefined;
  outcomes: ProfileOutcome[];
  profilesDir: string;
  selection: DeleteSelection;
  type: 'delete';
}

export interface LaunchResult {
  browser: string;
  entry: ProfileEntry;
  type: 'launch';
}

/** What a dry-run launch would do. */
export interface LaunchPlanResult {
  /** The command that would start the browser, unset when the profile is already running. */
  command: readonly string[] | undefined;
  pages: readonly string[];
  port: string;
  profile: string;
  type: 'launch-plan';
}

export interface ListResult {
  /** Every listed profile, unset when the profiles directory does not exist. */
  entries: ProfileEntry[] | undefined;
  isStaleOnly: boolean;
  profilesDir: string;
  type: 'list';
}

export interface QuitResult {
  isAll: boolean;
  outcomes: ProfileOutcome[];
  type: 'quit';
}

export interface QuitIdleResult {
  outcomes: ProfileOutcome[];
  type: 'quit-idle';
}

export interface ShowInstancePageResult {
  entry: ProfileEntry;
  page: string;
  type: 'show-instance-page';
}

export interface StatusResult {
  endpoint: string;
  entry: ProfileEntry;
  type: 'status';
}

/** Each verb's result by its type. */
export interface VerbResults {
  delete: DeleteResult;
  launch: LaunchResult;
  'launch-plan': LaunchPlanResult;
  list: ListResult;
  quit: QuitResult;
  'quit-idle': QuitIdleResult;
  'show-instance-page': ShowInstancePageResult;
  status: StatusResult;
}

export type VerbResult = VerbResults[keyof VerbResults];

/** Returns a verb's exit status: 1 when it refused any profile, else 0. */
export function deriveExitStatus(result: VerbResult): number {
  if (!('outcomes' in result)) return 0;
  return result.outcomes.some((outcome) => outcome.type === 'refused') ? 1 : 0;
}
