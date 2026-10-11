import type { JiraRequest } from '@williamthorsen/toolbelt.atlassian/candidate';

export const FAKE_BASE_URL = 'https://api.atlassian.com/ex/jira/fake-cloud-id';

const OK = 200;

/**
 * Builds a request function that responds from a route table, alongside the log of what it was called with. A route
 * returns one response, one response per call in order, or one computed from the request body.
 */
export function createFakeRequest(routes: FakeRoutes, options: FakeRequestOptions = {}): FakeTransport {
  const { baseUrl = FAKE_BASE_URL } = options;
  const calls: FakeCall[] = [];
  const consumed = new Map<string, number>();

  const request: JiraRequest = (method, path, body) => {
    calls.push({ body, method, path });

    const found = findRoute(routes, method, path);
    if (found === undefined) {
      throw new Error(`No fake route for '${method} ${path}'. Routes: ${Object.keys(routes).join(', ')}`);
    }

    const index = consumed.get(found.key) ?? 0;
    consumed.set(found.key, index + 1);

    const answered = answerRoute(found.route, body, index, found.key);

    return Promise.resolve({
      json: answered.json,
      status: answered.status ?? OK,
      text: answered.text,
      url: `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`,
    });
  };

  return { calls, request };
}

/** One request that the fake transport was asked to issue. */
export interface FakeCall {
  readonly body: unknown;
  readonly method: string;
  readonly path: string;
}

export interface FakeRequestOptions {
  /** The origin against which a route's path is resolved, which appears in `JiraResponse.url`. */
  readonly baseUrl?: string | undefined;
}

/** What a route returns. The status defaults to 200, and a body set by neither field is an empty one. */
export interface FakeResponse {
  readonly json?: unknown;
  readonly status?: number | undefined;
  readonly text?: string | undefined;
}

/** A route returning the same response every time, one per call in order, or one computed from the request body. */
export type FakeRoute = FakeResponse | FakeRouteSequence | ((body: unknown) => FakeResponse);

/** A route returning a different response per call, which simulates a paginated read. */
export interface FakeRouteSequence {
  readonly sequence: readonly FakeResponse[];
}

/** Routes keyed by method and path, such as `GET /rest/api/3/project/PROJ`. */
export type FakeRoutes = Record<string, FakeRoute>;

export interface FakeTransport {
  /** Every call in the order it was made, an unmatched one included, since the throw happens after the log. */
  readonly calls: readonly FakeCall[];
  readonly request: JiraRequest;
}

// region | Helpers

/** Resolves a route to the response for one call, whichever of the three forms it takes. */
function answerRoute(route: FakeRoute, body: unknown, index: number, key: string): FakeResponse {
  if (typeof route === 'function') return route(body);
  if (!('sequence' in route)) return route;

  const response = route.sequence[index];
  if (response === undefined) {
    throw new Error(`Route '${key}' was called ${index + 1} times but contains ${route.sequence.length} responses.`);
  }

  return response;
}

/** Finds the route for a call, matching the path whole and then without its query string. */
function findRoute(routes: FakeRoutes, method: string, path: string): FoundRoute | undefined {
  const keys = [`${method} ${path}`, `${method} ${path.split('?', 1)[0] ?? path}`];

  for (const key of keys) {
    const route = routes[key];
    if (route !== undefined) return { key, route };
  }

  return undefined;
}

interface FoundRoute {
  readonly key: string;
  readonly route: FakeRoute;
}

// endregion | Helpers
