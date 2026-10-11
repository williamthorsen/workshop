import { describe, expect, it } from 'vitest';

import { run } from '../run.ts';
import { createRunHarness, HARNESS_VERSION } from '../test-utils/createRunHarness.ts';

const EMAIL = 'someone@example.com';
const SERVICE = 'toolbelt.atlassian.jira';
const EMAIL_ENV = { JIRA_EMAIL: EMAIL };

describe(run, () => {
  describe('the root command', () => {
    it('prints the help for which it is asked', async () => {
      const harness = createRunHarness({ env: EMAIL_ENV });

      await expect(run(['--help'], harness.effects)).resolves.toBe(0);
      expect(harness.readOutput()).toContain('Usage: thor-jira [options] <command>');
      expect(harness.readOutput()).toContain('Exit codes:');
    });

    it.each([['--version'], ['-V']])('prints the installed version on %o', async (flag) => {
      const harness = createRunHarness({ env: EMAIL_ENV });

      await expect(run([flag], harness.effects)).resolves.toBe(0);
      expect(harness.readOutput()).toBe(`${HARNESS_VERSION}\n`);
    });

    it('reports a failure to resolve the version as a usage error', async () => {
      const harness = createRunHarness();
      const effects = {
        ...harness.effects,
        resolveVersion: () => {
          throw new Error('The manifest declares no version.');
        },
      };

      await expect(run(['--version'], effects)).resolves.toBe(2);
      expect(harness.readErrors()).toBe("Error: The manifest declares no version.\nTry 'thor-jira --help'.\n");
    });

    it('reports a missing subcommand as a usage error', async () => {
      const harness = createRunHarness({ env: EMAIL_ENV });

      await expect(run([], harness.effects)).resolves.toBe(2);
      expect(harness.readErrors()).toContain('Error: A command is required.');
    });

    it('distinguishes an unknown option from an unknown subcommand', async () => {
      const options = createRunHarness();
      const subcommands = createRunHarness();

      await run(['--nope'], options.effects);
      await run(['nope'], subcommands.effects);

      expect(options.readErrors()).toContain('Error: Unknown option: --nope');
      expect(subcommands.readErrors()).toContain('Error: Unknown command: nope');
    });

    it('points a failing subcommand at the help of that subcommand', async () => {
      const harness = createRunHarness({ env: EMAIL_ENV });

      await run(['auth', 'nope'], harness.effects);

      expect(harness.readErrors()).toContain("Try 'thor-jira auth --help'.");
    });

    it('suggests the closest command for a near miss', async () => {
      const harness = createRunHarness();

      await run(['isue'], harness.effects);

      expect(harness.readErrors()).toContain("Did you mean 'issue'?");
    });

    it('lists issue among its subcommands', async () => {
      const harness = createRunHarness();

      await run(['--help'], harness.effects);

      expect(harness.readOutput()).toContain('  issue              List a project');
    });
  });

  describe('auth', () => {
    it('prints the help for which it is asked', async () => {
      const harness = createRunHarness({ env: EMAIL_ENV });

      await expect(run(['auth', '--help'], harness.effects)).resolves.toBe(0);
      expect(harness.readOutput()).toContain('Usage: thor-jira auth');
    });

    it('stores a piped token under the resolved email, dropping the newline that a shell adds', async () => {
      const harness = createRunHarness({ env: EMAIL_ENV, stdin: 'a-token\n' });

      await expect(run(['auth', 'set'], harness.effects)).resolves.toBe(0);
      expect(harness.stored()).toStrictEqual({ [`${EMAIL}|${SERVICE}`]: 'a-token' });
    });

    it('prompts for a token at a terminal rather than reading stdin', async () => {
      const harness = createRunHarness({ env: EMAIL_ENV, isTty: true, prompted: 'typed-token' });

      await run(['auth', 'set'], harness.effects);

      expect(harness.stored()).toStrictEqual({ [`${EMAIL}|${SERVICE}`]: 'typed-token' });
    });

    it.each([
      [['auth', 'set', '--email', 'other@example.com', '--service', 'custom']],
      [['auth', '--email', 'other@example.com', '--service', 'custom', 'set']],
    ])('stores under the email and service that it is given, on either side of the action: %o', async (args) => {
      const harness = createRunHarness({ env: EMAIL_ENV, stdin: 'a-token' });

      await run(args, harness.effects);

      expect(harness.stored()).toStrictEqual({ 'other@example.com|custom': 'a-token' });
    });

    it('removes a stored token', async () => {
      const harness = createRunHarness({ env: EMAIL_ENV, stored: { [`${EMAIL}|${SERVICE}`]: 'a-token' } });

      await expect(run(['auth', 'delete'], harness.effects)).resolves.toBe(0);
      expect(harness.stored()).toStrictEqual({});
    });

    it('exits 1 when there was no token to remove', async () => {
      const harness = createRunHarness({ env: EMAIL_ENV });

      await expect(run(['auth', 'delete'], harness.effects)).resolves.toBe(1);
    });

    it('reports the keychain as the source, without reading the token', async () => {
      const harness = createRunHarness({ env: EMAIL_ENV, stored: { [`${EMAIL}|${SERVICE}`]: 'a-token' } });

      await expect(run(['auth', 'status'], harness.effects)).resolves.toBe(0);
      expect(harness.readOutput()).toContain('would come from the macOS keychain');
      expect(harness.readOutput()).not.toContain('a-token');
      expect(harness.secretReads()).toBe(0);
    });

    it('reports the environment ahead of the keychain', async () => {
      const harness = createRunHarness({
        env: { JIRA_API_TOKEN: 'from-env', JIRA_EMAIL: EMAIL },
        stored: { [`${EMAIL}|${SERVICE}`]: 'a-token' },
      });

      await run(['auth', 'status'], harness.effects);

      expect(harness.readOutput()).toContain('the JIRA_API_TOKEN environment variable');
    });

    it('exits 1 when no source would supply a token', async () => {
      const harness = createRunHarness({ env: EMAIL_ENV });

      await expect(run(['auth', 'status'], harness.effects)).resolves.toBe(1);
      expect(harness.readOutput()).toContain('No token would be found');
    });

    it('reports a token that the keychain cannot store as a usage error, not an unreachable keychain', async () => {
      // A token too long for `security`'s command line is passed to the store and refused there, which is the
      // case not covered by the blank guard above.
      const harness = createRunHarness({
        env: EMAIL_ENV,
        stdin: 'a'.repeat(4_096),
        unstorable: 'The secret is too long to store.',
      });

      await expect(run(['auth', 'set'], harness.effects)).resolves.toBe(2);
      expect(harness.readErrors()).toContain('The secret is too long to store.');
    });

    it('refuses a blank token, which the resolver would drop and status would still report', async () => {
      const harness = createRunHarness({ env: EMAIL_ENV, stdin: '   \n' });

      await expect(run(['auth', 'set'], harness.effects)).resolves.toBe(2);
      expect(harness.readErrors()).toContain('The token is blank.');
      expect(harness.stored()).toStrictEqual({});
    });

    it('reports an unreachable keychain as its own exit code', async () => {
      const harness = createRunHarness({ env: EMAIL_ENV, keystoreFault: 'the keychain is locked' });

      await expect(run(['auth', 'delete'], harness.effects)).resolves.toBe(3);
      expect(harness.readErrors()).toContain('the keychain is locked');
    });

    it('reports a missing email as a usage error', async () => {
      const harness = createRunHarness({ env: {} });

      await expect(run(['auth', 'status'], harness.effects)).resolves.toBe(2);
      expect(harness.readErrors()).toContain('No Atlassian account email was given');
    });
  });
});
