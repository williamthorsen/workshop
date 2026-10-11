import {
  type JiraRequest,
  resolveJiraBaseUrl,
  resolveJiraEmail,
  resolveJiraSite,
  resolveJiraToken,
} from '@williamthorsen/toolbelt.atlassian/candidate';
import type { FlagSchema } from '@williamthorsen/toolbelt.cli/candidate';

import { createDeferredStore, type RunEffects, stripOneTrailingNewline } from './subcommand-support.ts';

/**
 * The flags through which every subcommand that calls Jira accepts its credential.
 *
 * @internal
 */
export const CREDENTIAL_OPTIONS = {
  email: { type: 'string', description: 'Atlassian account email; names the keychain account', valueHint: 'address' },
  site: { type: 'string', description: 'Jira site, such as acme.atlassian.net', valueHint: 'host' },
  spec: { type: 'string', description: 'Spec file, rather than the upward search', valueHint: 'path' },
  tokenCommand: { type: 'string', description: 'Shell line printing the API token', valueHint: 'cmd' },
  tokenStdin: { type: 'boolean', description: 'Read the API token from stdin' },
} as const satisfies FlagSchema;

/**
 * Resolves the site, email, and token from the flags, the environment, and the spec's fallbacks, and builds the
 * transport through which the subcommand calls Jira.
 *
 * @internal
 */
export async function createSubcommandRequest(
  effects: RunEffects,
  credentials: CredentialValues,
  fallbacks: CredentialFallbacks = {},
): Promise<JiraRequest> {
  const email = resolveJiraEmail({ email: credentials.email, env: effects.env, fallback: fallbacks.email });

  return effects.createRequest({
    baseUrl: await resolveJiraBaseUrl({
      fetch: effects.fetch,
      site: resolveJiraSite({ env: effects.env, fallback: fallbacks.site, site: credentials.site }),
    }),
    email,
    fetch: effects.fetch,
    token: resolveJiraToken({
      account: email,
      env: effects.env,
      store: createDeferredStore(effects),
      token: credentials.tokenStdin ? stripOneTrailingNewline(await effects.readStdin()) : undefined,
      tokenCommand: credentials.tokenCommand,
    }),
  });
}

/** The spec values that end the email and site resolution chains. */
export interface CredentialFallbacks {
  readonly email?: string | undefined;
  readonly site?: string | undefined;
}

/** The parsed values of `CREDENTIAL_OPTIONS` on which the request depends. */
export interface CredentialValues {
  readonly email?: string | undefined;
  readonly site?: string | undefined;
  readonly tokenCommand?: string | undefined;
  readonly tokenStdin?: boolean | undefined;
}
