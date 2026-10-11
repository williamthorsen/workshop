import { describe, expect, it } from 'vitest';

import type { FakeRoutes } from '../../test-utils/createFakeRequest.ts';
import { run } from '../run.ts';
import { createRunHarness, type HarnessOptions } from '../test-utils/createRunHarness.ts';

const SEARCH_ROUTE = 'POST /rest/api/3/search/jql';
const SPEC_PATH = '/repo/jira-project-spec.json';
const STATUSES = [{ category: 'TODO', name: 'To Do' }];

const SPEC_WITH_KEY = JSON.stringify({ projectKey: 'PROJ', site: 'spec.atlassian.net', statuses: STATUSES });
const SPEC_WITHOUT_KEY = JSON.stringify({ site: 'spec.atlassian.net', statuses: STATUSES });

describe('thor-jira issue list', () => {
  it('prints the help for which it is asked', async () => {
    const harness = createHarness();

    await expect(runSubcommand(harness, ['--help'])).resolves.toBe(0);
    expect(harness.readOutput()).toContain('Usage: thor-jira issue list [options]');
    expect(harness.readOutput()).toContain('-L, --limit <n>');
  });

  it("lists the open work items of the spec's project, newest first, one line each", async () => {
    const harness = createHarness();

    await expect(runSubcommand(harness, [])).resolves.toBe(0);
    expect(harness.readOutput()).toBe('PROJ-2  In Progress  Second\nPROJ-1  To Do        First\n');
    expect(harness.calls[0]?.body).toStrictEqual({
      fields: ['status', 'summary'],
      jql: 'project = "PROJ" AND statusCategory != Done ORDER BY created DESC',
      maxResults: 20,
    });
  });

  it('authenticates with a token stored by tb-jira under the default keychain service', async () => {
    // The service is a literal so that an upgrade which renames the library default fails here.
    const harness = createHarness({
      env: { JIRA_EMAIL: 'someone@example.com' },
      stored: { 'someone@example.com|toolbelt.atlassian.jira': 'stored-token' },
    });

    await expect(runSubcommand(harness, [])).resolves.toBe(0);
    expect(harness.transportOptions()?.token).toBe('stored-token');
  });

  it('authenticates with a token that auth set stored', async () => {
    const harness = createHarness({ env: { JIRA_EMAIL: 'someone@example.com' }, stdin: 'piped-token\n' });

    await expect(run(['auth', 'set'], harness.effects)).resolves.toBe(0);
    await expect(runSubcommand(harness, [])).resolves.toBe(0);
    expect(harness.transportOptions()?.token).toBe('piped-token');
  });

  it('lists the project named by --project in preference to the spec', async () => {
    const harness = createHarness();

    await runSubcommand(harness, ['--project', 'OTHER']);

    expect(readJql(harness)).toBe('project = "OTHER" AND statusCategory != Done ORDER BY created DESC');
  });

  it.each([['--limit'], ['-L']])('takes the limit from %s', async (flag) => {
    const harness = createHarness();

    await runSubcommand(harness, [flag, '5']);

    expect(harness.calls[0]?.body).toMatchObject({ maxResults: 5 });
  });

  it.each(['0', '-1', '1.5', 'ten'])('refuses a limit of %j as a usage error', async (limit) => {
    const harness = createHarness();

    await expect(runSubcommand(harness, [`--limit=${limit}`])).resolves.toBe(2);
    expect(harness.readErrors()).toContain('--limit takes a positive integer.');
    expect(harness.calls).toHaveLength(0);
  });

  it('refuses an empty limit as a usage error', async () => {
    const harness = createHarness();

    await expect(runSubcommand(harness, ['--limit='])).resolves.toBe(2);
    expect(harness.readErrors()).toContain('Missing value for option: --limit');
    expect(harness.calls).toHaveLength(0);
  });

  it.each([
    ['closed', 'project = "PROJ" AND statusCategory = Done ORDER BY created DESC'],
    ['all', 'project = "PROJ" ORDER BY created DESC'],
  ])('selects work items by --state %s', async (state, jql) => {
    const harness = createHarness();

    await runSubcommand(harness, ['--state', state]);

    expect(readJql(harness)).toBe(jql);
  });

  it('refuses an unknown state as a usage error', async () => {
    const harness = createHarness();

    await expect(runSubcommand(harness, ['--state', 'done'])).resolves.toBe(2);
    expect(harness.readErrors()).toContain('Invalid value for --state: done. Expected one of: all, closed, open');
  });

  it('prints nothing and exits 0 when nothing matches', async () => {
    const harness = createHarness({ routes: { [SEARCH_ROUTE]: { json: { issues: [] } } } });

    await expect(runSubcommand(harness, [])).resolves.toBe(0);
    expect(harness.readOutput()).toBe('');
  });

  it('exits 4 without a help pointer when the search response cannot be read', async () => {
    const harness = createHarness({ routes: { [SEARCH_ROUTE]: { json: {} } } });

    await expect(runSubcommand(harness, [])).resolves.toBe(4);
    expect(harness.readErrors()).toContain("returned no 'issues' array. The response came from https://");
    expect(harness.readErrors()).not.toContain('--help');
  });

  it('issues nothing but reads, which a listing never needs', async () => {
    const harness = createHarness({ readOnly: true });

    await expect(runSubcommand(harness, [])).resolves.toBe(0);
  });

  describe('without a project key', () => {
    it('names the spec that it read, which does not set one', async () => {
      const harness = createHarness({ files: { [SPEC_PATH]: SPEC_WITHOUT_KEY } });

      await expect(runSubcommand(harness, [])).resolves.toBe(2);
      expect(harness.readErrors()).toContain(
        `A project key is required: pass --project, or set \`projectKey\` in the spec; ${SPEC_PATH} does not set \`projectKey\`.`,
      );
      expect(harness.calls).toHaveLength(0);
    });

    it('names the directory from which the search found no spec', async () => {
      const harness = createHarness({ files: {} });

      await expect(runSubcommand(harness, [])).resolves.toBe(2);
      expect(harness.readErrors()).toContain('the search found no jira-project-spec.json at or above /repo.');
    });

    it('resolves the key before the credential, so that a missing key opens no keychain', async () => {
      const harness = createHarness({ env: {}, files: {} });

      await runSubcommand(harness, []);

      expect(harness.secretReads()).toBe(0);
      expect(harness.readErrors()).toContain('A project key is required');
    });
  });

  describe('the spec', () => {
    it('is optional when the flags and the environment supply everything', async () => {
      const harness = createHarness({
        env: { JIRA_API_TOKEN: 'a-token', JIRA_EMAIL: 'someone@example.com', JIRA_SITE: 'env.atlassian.net' },
        files: {},
      });

      await expect(runSubcommand(harness, ['--project', 'PROJ'])).resolves.toBe(0);
      expect(harness.fetchedUrls()).toStrictEqual(['https://env.atlassian.net/_edge/tenant_info']);
    });

    it('supplies the site when neither the flag nor the environment does', async () => {
      const harness = createHarness();

      await runSubcommand(harness, []);

      expect(harness.fetchedUrls()).toStrictEqual(['https://spec.atlassian.net/_edge/tenant_info']);
    });

    it('is an error when --spec names one that cannot be read', async () => {
      const harness = createHarness();

      await expect(runSubcommand(harness, ['--project', 'PROJ', '--spec', '/missing.json'])).resolves.toBe(2);
      expect(harness.readErrors()).toContain("No fake file at '/missing.json'.");
    });
  });

  it('points a usage error at the help of issue list', async () => {
    const harness = createHarness();

    await runSubcommand(harness, ['--nope']);

    expect(harness.readErrors()).toContain("Try 'thor-jira issue list --help'.");
  });
});

describe('thor-jira issue', () => {
  it('prints the help for which it is asked', async () => {
    const harness = createHarness();

    await expect(run(['issue', '--help'], harness.effects)).resolves.toBe(0);
    expect(harness.readOutput()).toContain('Usage: thor-jira issue [options] <command>');
  });

  it.each([
    [[], 'Error: A command is required.'],
    [['nope'], 'Error: Unknown command: nope'],
    [['--nope'], 'Error: Unknown option: --nope'],
  ])('reports %j as a usage error pointing at the help of issue', async (args, message) => {
    const harness = createHarness();

    await expect(run(['issue', ...args], harness.effects)).resolves.toBe(2);
    expect(harness.readErrors()).toBe(`${message}\nTry 'thor-jira issue --help'.\n`);
  });
});

// region | Helpers

/** Builds a harness with a credential in the environment, a spec naming a project, and a search route. */
function createHarness(options: HarnessOptions = {}): ReturnType<typeof createRunHarness> {
  return createRunHarness({
    env: { JIRA_API_TOKEN: 'a-token', JIRA_EMAIL: 'someone@example.com' },
    files: { [SPEC_PATH]: SPEC_WITH_KEY },
    ...options,
    routes: { ...buildRoutes(), ...options.routes },
  });
}

/** Builds the search route, which returns two work items in the order in which the search lists them. */
function buildRoutes(): FakeRoutes {
  return {
    [SEARCH_ROUTE]: {
      json: {
        issues: [
          { fields: { status: { name: 'In Progress' }, summary: 'Second' }, key: 'PROJ-2' },
          { fields: { status: { name: 'To Do' }, summary: 'First' }, key: 'PROJ-1' },
        ],
      },
    },
  };
}

/** Reads the JQL of the first search that the run issued. */
function readJql(harness: ReturnType<typeof createRunHarness>): unknown {
  const body = harness.calls[0]?.body;

  return typeof body === 'object' && body !== null && 'jql' in body ? body.jql : undefined;
}

/** Runs `issue list` through the whole command line, so that dispatch is exercised alongside it. */
async function runSubcommand(harness: ReturnType<typeof createRunHarness>, args: string[]): Promise<number> {
  return await run(['issue', 'list', ...args], harness.effects);
}

// endregion | Helpers
