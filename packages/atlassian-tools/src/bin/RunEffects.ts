import type { JiraRequest, TokenTransportOptions } from '@williamthorsen/toolbelt.atlassian/candidate';
import type { WritableSecretStore } from '@williamthorsen/toolbelt.secrets/candidate';

/** The effects deferred to the entry point, which keeps every subcommand free of I/O. */
export interface RunEffects {
  /** Builds the transport through which every Jira call is issued. */
  readonly createRequest: (options: TokenTransportOptions) => JiraRequest;
  readonly createStore: () => WritableSecretStore;
  readonly cwd: () => string;
  readonly env: Record<string, string | undefined>;
  readonly fetch: typeof globalThis.fetch;
  /** Finds the consuming repo's project spec by ascending from a directory, returning `undefined` if none is found. */
  readonly findSpecPath: (fromDir: string) => string | undefined;
  readonly isStdinTty: () => boolean;
  /** Reads a token from the terminal, echoing nothing and asking twice. */
  readonly promptSecret: () => Promise<string>;
  readonly readStdin: () => Promise<string>;
  readonly readTextFile: (filePath: string) => string;
  readonly resolveVersion: () => string;
  readonly write: (text: string) => void;
  readonly writeError: (text: string) => void;
}
