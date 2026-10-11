import path from 'node:path';

import type { JiraRequest, TokenTransportOptions } from '@williamthorsen/toolbelt.atlassian/candidate';
import {
  type SecretQuery,
  UnstorableSecretError,
  type WritableSecretStore,
} from '@williamthorsen/toolbelt.secrets/candidate';

import { createFakeRequest, type FakeCall, type FakeRoutes } from '../../test-utils/createFakeRequest.ts';
import type { RunEffects } from '../subcommand-support.ts';

const CLOUD_ID = 'cloud-1';

/**
 * The gateway origin that the harness's fake transport reports, matching the cloudId that its tenant-info read
 * returns.
 */
export const HARNESS_BASE_URL = `https://api.atlassian.com/ex/jira/${CLOUD_ID}`;

/** Jira reads the workflow graph and runs a search through a POST, since each request contains its query in a body. */
const READ_ONLY_POSTS = new Set(['/rest/api/3/search/jql', '/rest/api/3/workflows']);

export const HARNESS_VERSION = '9.9.9';

/**
 * Builds a runner harness over an in-memory keychain and a fake transport, collecting what a run writes to each
 * stream. The site's tenant-info read is answered here too, so no test reaches the network.
 */
export function createRunHarness(options: HarnessOptions = {}): RunHarness {
  const {
    cwd = '/repo',
    env = {},
    fetchFault,
    files = {},
    isTty = false,
    keystoreFault,
    prompted = '',
    readOnly = false,
    routes = {},
    stdin = '',
    stored = {},
    unstorable,
  } = options;

  const secrets = new Map(Object.entries(stored));
  const output: string[] = [];
  const errors: string[] = [];
  const fetchedUrls: string[] = [];
  const { calls, request } = createFakeRequest(routes, { baseUrl: HARNESS_BASE_URL });
  let transportOptions: TokenTransportOptions | undefined;

  /** Throws the configured keychain fault. */
  function refuse(): never {
    throw new Error(keystoreFault);
  }

  let secretReads = 0;
  const store: WritableSecretStore = {
    deleteSecret: (query) => (keystoreFault === undefined ? secrets.delete(buildKey(query)) : refuse()),
    findSecret: (query) => {
      secretReads += 1;

      return keystoreFault === undefined ? secrets.get(buildKey(query)) : refuse();
    },
    hasSecret: (query) => (keystoreFault === undefined ? secrets.has(buildKey(query)) : refuse()),
    setSecret: (query, secret) => {
      if (unstorable !== undefined) throw new UnstorableSecretError(unstorable);
      if (keystoreFault !== undefined) refuse();

      secrets.set(buildKey(query), secret);
    },
  };

  return {
    calls,
    effects: {
      createRequest: (options) => {
        transportOptions = options;

        return readOnly ? guardReads(request) : request;
      },
      createStore: () => store,
      cwd: () => cwd,
      env,
      fetch: (input) => {
        fetchedUrls.push(describeFetchTarget(input));
        if (fetchFault !== undefined) return Promise.reject(fetchFault);

        return Promise.resolve(Response.json({ cloudId: CLOUD_ID }));
      },
      // The real ascent is covered by `findSpecPath`'s own test; here the path is composed, and `files`
      // decides whether a spec is there.
      findSpecPath: (fromDir) => {
        const specPath = path.join(fromDir, 'jira-project-spec.json');

        return files[specPath] === undefined ? undefined : specPath;
      },
      isStdinTty: () => isTty,
      promptSecret: () => Promise.resolve(prompted),
      readStdin: () => Promise.resolve(stdin),
      readTextFile: (filePath) => {
        const text = files[filePath];
        if (text === undefined) throw new Error(`No fake file at '${filePath}'.`);

        return text;
      },
      resolveVersion: () => HARNESS_VERSION,
      write: (text) => void output.push(text),
      writeError: (text) => void errors.push(text),
    },
    fetchedUrls: () => fetchedUrls,
    readErrors: () => errors.join(''),
    readOutput: () => output.join(''),
    secretReads: () => secretReads,
    stored: () => Object.fromEntries(secrets),
    transportOptions: () => transportOptions,
  };
}

export interface HarnessOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  /** Rejects the tenant-info read with this error, which is how an unreachable site is exercised. */
  fetchFault?: Error;
  /** What `readTextFile` returns, keyed by path. */
  files?: Record<string, string>;
  isTty?: boolean;
  /** Makes every keychain call throw, which is how an unreachable keychain is exercised. */
  keystoreFault?: string;
  prompted?: string;
  /** Fails the run on any call that writes, which is how a dry run is held to writing nothing. */
  readOnly?: boolean;
  routes?: FakeRoutes;
  stdin?: string;
  stored?: Record<string, string>;
  /** Makes `setSecret` raise `UnstorableSecretError`, which the keychain never sees. */
  unstorable?: string;
}

export interface RunHarness {
  /** Every call that the transport was asked to issue, in order. */
  calls: readonly FakeCall[];
  effects: RunEffects;
  /** Every URL with which `fetch` was called, which is the site from which the cloudId was read. */
  fetchedUrls: () => string[];
  readErrors: () => string;
  readOutput: () => string;
  /** How many times the token itself was retrieved, which reporting a source must never do. */
  secretReads: () => number;
  stored: () => Record<string, string>;
  /** The credential with which the transport was built, or `undefined` if the run never reached it. */
  transportOptions: () => TokenTransportOptions | undefined;
}

// region | Helpers

/** Names the in-memory item addressed by a query. */
function buildKey(query: SecretQuery): string {
  return `${query.account ?? ''}|${query.service}`;
}

/** Names the URL at which a fetch was aimed, whichever of the three forms the argument takes. */
function describeFetchTarget(input: Parameters<typeof globalThis.fetch>[0]): string {
  if (input instanceof URL) return input.href;
  if (typeof input === 'string') return input;

  return input.url;
}

/**
 * Wraps a transport so that a call which is not a known read fails the test rather than reaching the fake
 * routes. The allowance is a list rather than a denial of the writes made by this package today, so a write added
 * later fails a dry run's test by default.
 */
function guardReads(request: JiraRequest): JiraRequest {
  return (method, path, body) => {
    const isRead = method === 'GET' || (method === 'POST' && READ_ONLY_POSTS.has(path.split('?', 1)[0] ?? path));
    if (!isRead) throw new Error(`A read-only run issued ${method} ${path}.`);

    return request(method, path, body);
  };
}

// endregion | Helpers
