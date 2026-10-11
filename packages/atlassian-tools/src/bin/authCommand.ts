import {
  DEFAULT_TOKEN_SERVICE,
  findJiraTokenSource,
  type JiraTokenSource,
  resolveJiraEmail,
} from '@williamthorsen/toolbelt.atlassian/candidate';
import { type Command, createCli } from '@williamthorsen/toolbelt.cli/candidate';

import {
  callKeystore,
  createDeferredStore,
  EXIT_NO_RESULT,
  EXIT_OK,
  reportFailures,
  type RunEffects,
  stripOneTrailingNewline,
  succeed,
} from './subcommand-support.ts';

const { defineCommand } = createCli<RunEffects>();

const SOURCE_DESCRIPTIONS: Record<JiraTokenSource, string> = {
  command: 'the configured token command',
  env: 'the JIRA_API_TOKEN environment variable',
  keychain: 'the macOS keychain',
  supplied: 'a supplied value',
};

/**
 * The `auth` command, which stores, removes, and reports the token with which the Jira transport authenticates. Its
 * action is an operand rather than a command token, so that its flags are accepted on either side of it.
 *
 * @internal
 */
export const authCommand: Command<RunEffects> = defineCommand({
  summary: 'Store, remove, and report the Jira API token',
  description: `Manage the Jira API token. It is stored in the macOS keychain under the service \`${DEFAULT_TOKEN_SERVICE}\`,
with the Atlassian account email as the account, which is the same item that \`thor-secret\` reads and writes.
\`delete\` and \`set\` require macOS. \`status\` opens the keychain only when the earlier sources miss.`,
  epilog: `Actions:
  delete  Remove the stored token, exiting 1 if none is stored
  set     Store a token, replacing one already stored under the same email
  status  Report which source would supply the token, printing the token nowhere

At a terminal, \`set\` prompts for the token twice and echoes nothing; piped, it reads stdin and drops one
trailing newline, since \`echo\` adds one.

\`status\` names the first of JIRA_API_TOKEN, a configured command, and the keychain that would supply it. It
probes the keychain for presence rather than reading it, so it raises no keychain access prompt; a configured
command does run, and its output is discarded. Presence is not contents: An item containing only whitespace is
reported here and dropped by the resolver, which \`set\` refuses to create.`,
  flags: {
    email: { type: 'string', description: 'Atlassian account email (default: $JIRA_EMAIL)', valueHint: 'address' },
    service: { type: 'string', description: `Keychain service (default: ${DEFAULT_TOKEN_SERVICE})`, valueHint: 'name' },
    tokenCommand: {
      type: 'string',
      description: 'status only: the shell line to probe as the command source',
      valueHint: 'cmd',
    },
  },
  operands: [{ name: 'action', description: 'delete, set, or status', choices: ['delete', 'set', 'status'] }],
  run: ({ context: effects, flags, operands, stderr }) =>
    reportFailures(stderr, async () => {
      const account = resolveJiraEmail({ email: flags.email, env: effects.env });
      const service = flags.service ?? DEFAULT_TOKEN_SERVICE;

      if (operands.action === 'delete') return runDelete(effects, account, service);
      if (operands.action === 'set') return await runSet(effects, account, service);

      return runStatus(effects, account, service, flags.tokenCommand);
    }),
});

// region | Helpers

/** Removes the stored token, reporting through the exit code whether one was there. */
function runDelete(effects: RunEffects, account: string, service: string): number {
  const removed = callKeystore(() => effects.createStore().deleteSecret({ account, service }));
  if (!removed) return EXIT_NO_RESULT;

  return succeed(effects, `Removed the token for ${account}.`);
}

/**
 * Stores a token, read from the terminal without echo or from stdin when the input is piped. The store is
 * opened first, so that a platform without a keychain is reported before a token is typed into this process.
 */
async function runSet(effects: RunEffects, account: string, service: string): Promise<number> {
  const store = callKeystore(() => effects.createStore());
  const token = effects.isStdinTty()
    ? await effects.promptSecret()
    : stripOneTrailingNewline(await effects.readStdin());

  // The resolution chain drops a blank token, so storing one leaves an item that `auth status` reports and
  // `configure-project` cannot use.
  if (token.trim() === '') throw new Error('The token is blank. Nothing was stored.');

  callKeystore(() => store.setSecret({ account, service }, token));

  return succeed(effects, `Stored a token for ${account} under ${service}.`);
}

/** Reports which source would supply the token, naming it rather than printing the token. */
function runStatus(effects: RunEffects, account: string, service: string, tokenCommand: string | undefined): number {
  const source = findJiraTokenSource({
    account,
    env: effects.env,
    service,
    store: createDeferredStore(effects),
    tokenCommand,
  });

  if (source === undefined) {
    effects.write(`No token would be found for ${account} under ${service}.\n`);

    return EXIT_NO_RESULT;
  }

  effects.write(`A token for ${account} would come from ${SOURCE_DESCRIPTIONS[source]}.\n`);

  return EXIT_OK;
}

// endregion | Helpers
