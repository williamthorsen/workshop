import { describe, expect, it } from 'vitest';

import type { FakeRoutes } from '../../test-utils/createFakeRequest.ts';
import { run } from '../run.ts';
import { createRunHarness, HARNESS_BASE_URL, type HarnessOptions } from '../test-utils/createRunHarness.ts';

const BOARD_ID = 1;
const KEY = 'PROJ';
const PROJECT_ID = '10000';
const SPEC_PATH = '/repo/jira-project-spec.json';

const CONFORMANT_SPEC = JSON.stringify({
  boardFeatures: { 'jsw.agility.backlog': 'DISABLED' },
  email: 'spec@example.com',
  site: 'spec.atlassian.net',
  statuses: [
    { category: 'TODO', name: 'To Do' },
    { category: 'DONE', name: 'Done' },
  ],
});

const KEYED_SPEC = JSON.stringify({ ...JSON.parse(CONFORMANT_SPEC), projectKey: KEY });

const RENAMING_SPEC = JSON.stringify({
  site: 'spec.atlassian.net',
  statuses: [
    { aliases: ['To Do'], category: 'TODO', name: 'Todo' },
    { category: 'DONE', name: 'Done' },
  ],
});

describe('thor-jira configure-project', () => {
  it('prints the help for which it is asked', async () => {
    const harness = createHarness();

    await expect(runSubcommand(harness, ['--help'])).resolves.toBe(0);
    expect(harness.readOutput()).toContain('Usage: thor-jira configure-project [options] [<key>]');
  });

  it('requires a project key when the spec does not set one, naming both sources', async () => {
    const harness = createHarness();

    await expect(runSubcommand(harness, [])).resolves.toBe(2);
    expect(harness.readErrors()).toContain(
      `A project key is required: pass it as an argument, or set \`projectKey\` in the spec; ${SPEC_PATH} does not set \`projectKey\`.`,
    );
  });

  it("reconciles the spec's project when no key is passed", async () => {
    const harness = createHarness({ files: { [SPEC_PATH]: KEYED_SPEC } });

    await expect(runSubcommand(harness, [])).resolves.toBe(0);
    expect(harness.calls.some((call) => call.path === `/rest/api/3/project/${KEY}`)).toBe(true);
  });

  it("prefers a passed key to the spec's", async () => {
    const harness = createHarness({
      files: { [SPEC_PATH]: JSON.stringify({ ...JSON.parse(CONFORMANT_SPEC), projectKey: 'OTHER' }) },
    });

    await expect(runSubcommand(harness, [KEY])).resolves.toBe(0);
    expect(harness.calls.some((call) => call.path.includes('OTHER'))).toBe(false);
  });

  it('reports a project that already matches the spec, and exits 0', async () => {
    const harness = createHarness();

    await expect(runSubcommand(harness, [KEY])).resolves.toBe(0);
    expect(harness.readOutput()).toContain('no changes: The project already matches the spec');
    expect(harness.readOutput()).toContain('configuration after the run:');
  });

  it('finds the spec by ascending from the working directory', async () => {
    const harness = createHarness({ cwd: '/repo', files: { [SPEC_PATH]: CONFORMANT_SPEC } });

    await expect(runSubcommand(harness, [KEY])).resolves.toBe(0);
  });

  it('reports a missing spec, naming the directory searched and the flag that skips the search', async () => {
    const harness = createHarness({ files: {} });

    await expect(runSubcommand(harness, [KEY])).resolves.toBe(2);
    expect(harness.readErrors()).toContain('No jira-project-spec.json at or above /repo. Name one with --spec.');
  });

  it('reads the spec that --spec names', async () => {
    const harness = createHarness({ files: { '/elsewhere/spec.json': CONFORMANT_SPEC } });

    await expect(runSubcommand(harness, [KEY, '--spec', '/elsewhere/spec.json'])).resolves.toBe(0);
  });

  describe('a dry run', () => {
    it('prints the plan and writes nothing, against a transport that fails on anything but a known read', async () => {
      const harness = createHarness({ files: { [SPEC_PATH]: RENAMING_SPEC }, readOnly: true });

      await expect(runSubcommand(harness, [KEY, '--dry-run'])).resolves.toBe(0);
      expect(harness.readOutput()).toContain("update    status id-1: 'To Do' → 'Todo'");
      expect(harness.readOutput()).toContain('dry run: Nothing was written');
    });

    it('reports the seed that it would run without moving anything', async () => {
      const harness = createHarness({ readOnly: true });

      await runSubcommand(harness, [KEY, '--dry-run', '--seed-backlog', 'To Do']);

      expect(harness.readOutput()).toContain("seed      move every 'To Do' work item off the board");
      expect(harness.readOutput()).not.toContain('no changes');
    });
  });

  describe('a real run', () => {
    it('writes the reconciled workflow and reports what it amended', async () => {
      const harness = createHarness({ files: { [SPEC_PATH]: RENAMING_SPEC } });

      await runSubcommand(harness, [KEY]);

      expect(harness.readOutput()).toContain('workflow  updated: 1 amended, 0 created');
      expect(harness.calls.some((call) => call.method === 'POST' && call.path === '/rest/api/3/workflows/update')).toBe(
        true,
      );
    });

    it('issues no workflow write when the plan contains no change', async () => {
      const harness = createHarness();

      await runSubcommand(harness, [KEY]);

      expect(harness.readOutput()).toContain('workflow  unchanged');
    });

    it('moves the named status off the board and names the call that puts it back', async () => {
      const harness = createHarness();

      await runSubcommand(harness, [KEY, '--seed-backlog', 'To Do']);

      expect(harness.readOutput()).toContain("backlog   moved 2 'To Do' work items off the board");
      expect(harness.readOutput()).toContain(
        `\n          undo: POST /rest/agile/1.0/board/${BOARD_ID}/issue, 50 keys per call`,
      );
    });

    it('names the query that recovers the keys, which the seed itself never prints', async () => {
      const harness = createHarness();

      await runSubcommand(harness, [KEY, '--seed-backlog', 'To Do']);

      expect(harness.readOutput()).toContain(`\n          keys: project = "${KEY}" AND status = "To Do"`);
    });

    it('reports an empty seed rather than issuing a move', async () => {
      const harness = createHarness({ routes: { 'POST /rest/api/3/search/jql': { json: { issues: [] } } } });

      await runSubcommand(harness, [KEY, '--seed-backlog', 'To Do']);

      expect(harness.readOutput()).toContain("backlog   no 'To Do' work items to move");
      expect(harness.calls.some((call) => call.path.includes('/backlog/'))).toBe(false);
    });

    it('exits 5 when the server does not have what the spec declares', async () => {
      const harness = createHarness({ files: { [SPEC_PATH]: RENAMING_SPEC } });

      await expect(runSubcommand(harness, [KEY])).resolves.toBe(5);
      expect(harness.readOutput()).toContain("MISS Todo (absent), transition 'absent'");
    });
  });

  describe('an unreadable or refused project', () => {
    it('exits 4 without a help pointer when a response cannot be read', async () => {
      const harness = createHarness({
        routes: { [`GET /rest/api/3/project/${KEY}`]: { json: { style: 'next-gen' } } },
      });

      await expect(runSubcommand(harness, [KEY])).resolves.toBe(4);
      expect(harness.readErrors()).toContain(
        `Project ${KEY} returned no 'id'. The response came from ${HARNESS_BASE_URL}`,
      );
      expect(harness.readErrors()).not.toContain('--help');
    });

    it('exits 2 with a help pointer when the project has no board', async () => {
      const harness = createHarness({ routes: { 'GET /rest/agile/1.0/board': { json: { values: [] } } } });

      await expect(runSubcommand(harness, [KEY])).resolves.toBe(2);
      expect(harness.readErrors()).toContain(`Project ${KEY} has no board.`);
      expect(harness.readErrors()).toContain("Try 'thor-jira configure-project --help'.");
    });
  });

  describe('the credential', () => {
    it('exits 4 naming the call that Jira rejected', async () => {
      const harness = createHarness({
        routes: { 'GET /rest/api/3/project/PROJ': { json: { errorMessages: ['Unauthorized'] }, status: 401 } },
      });

      await expect(runSubcommand(harness, [KEY])).resolves.toBe(4);
      expect(harness.readErrors()).toContain('401');
    });

    it('exits 4 naming the scope shortfall and the URL when the gateway rejects the token', async () => {
      const harness = createHarness({
        routes: {
          'GET /rest/api/3/project/PROJ': {
            json: { code: 401, message: 'Unauthorized; scope does not match' },
            status: 401,
          },
        },
      });

      await expect(runSubcommand(harness, [KEY])).resolves.toBe(4);
      expect(harness.readErrors()).toContain('The token lacks a scope required by this endpoint.');
      expect(harness.readErrors()).toContain(`${HARNESS_BASE_URL}/rest/api/3/project/PROJ`);
    });

    it('reads the token from stdin, dropping the newline that a shell adds', async () => {
      const harness = createHarness({ env: {}, stdin: 'piped-token\n' });

      await expect(runSubcommand(harness, [KEY, '--token-stdin'])).resolves.toBe(0);
      expect(harness.transportOptions()?.token).toBe('piped-token');
    });

    it('builds the transport with the resolved site, email, and token', async () => {
      const harness = createHarness();

      await runSubcommand(harness, [KEY]);

      expect(harness.transportOptions()).toMatchObject({
        baseUrl: 'https://api.atlassian.com/ex/jira/cloud-1',
        email: 'someone@example.com',
        token: 'a-token',
      });
      expect(harness.fetchedUrls()).toStrictEqual(['https://spec.atlassian.net/_edge/tenant_info']);
    });

    it('prefers --site over the environment and the spec, reading the cloudId from it', async () => {
      const harness = createHarness({
        env: { JIRA_API_TOKEN: 'a-token', JIRA_EMAIL: 'someone@example.com', JIRA_SITE: 'env.atlassian.net' },
      });

      await runSubcommand(harness, [KEY, '--site', 'flag.atlassian.net']);

      expect(harness.fetchedUrls()).toStrictEqual(['https://flag.atlassian.net/_edge/tenant_info']);
    });

    it('falls back to JIRA_SITE before the spec', async () => {
      const harness = createHarness({
        env: { JIRA_API_TOKEN: 'a-token', JIRA_EMAIL: 'someone@example.com', JIRA_SITE: 'env.atlassian.net' },
      });

      await runSubcommand(harness, [KEY]);

      expect(harness.fetchedUrls()).toStrictEqual(['https://env.atlassian.net/_edge/tenant_info']);
    });

    it('exits 3 when the keychain could not be reached', async () => {
      const harness = createHarness({
        env: { JIRA_EMAIL: 'someone@example.com' },
        keystoreFault: 'the keychain is locked',
      });

      await expect(runSubcommand(harness, [KEY])).resolves.toBe(3);
      expect(harness.readErrors()).toContain('the keychain is locked');
    });

    it('reports a token absent from every source, naming the command that stores one', async () => {
      const harness = createHarness({ env: {} });

      await expect(runSubcommand(harness, [KEY])).resolves.toBe(2);
      expect(harness.readErrors()).toContain('thor-secret set toolbelt.atlassian.jira');
    });

    it('takes the email from the spec when neither the flag nor the environment supplies one', async () => {
      const harness = createHarness({ env: { JIRA_API_TOKEN: 'a-token' } });

      await expect(runSubcommand(harness, [KEY])).resolves.toBe(0);
      expect(harness.transportOptions()?.email).toBe('spec@example.com');
    });

    it('prefers --email over the environment and the spec', async () => {
      const harness = createHarness();

      await runSubcommand(harness, [KEY, '--email', 'flag@example.com']);

      expect(harness.transportOptions()?.email).toBe('flag@example.com');
    });

    it('reports a site absent from every source', async () => {
      const harness = createHarness({
        files: { [SPEC_PATH]: JSON.stringify({ statuses: [{ category: 'TODO', name: 'To Do' }] }) },
      });

      await expect(runSubcommand(harness, [KEY])).resolves.toBe(2);
      expect(harness.readErrors()).toContain('JIRA_SITE');
    });

    it('exits 6 when Jira could not be reached, naming the URL and the fault', async () => {
      const cause = new Error('getaddrinfo ENOTFOUND spec.atlassian.net');
      const harness = createHarness({ fetchFault: new TypeError('fetch failed', { cause }) });

      await expect(runSubcommand(harness, [KEY])).resolves.toBe(6);
      expect(harness.readErrors()).toContain(
        'Could not reach https://spec.atlassian.net/_edge/tenant_info: fetch failed: getaddrinfo ENOTFOUND spec.atlassian.net',
      );
    });

    it('does not point an unreachable site at the help, which cannot fix a network', async () => {
      const harness = createHarness({ fetchFault: new TypeError('fetch failed') });

      await runSubcommand(harness, [KEY]);

      expect(harness.readErrors()).not.toContain('--help');
    });
  });
});

// region | Helpers

/** Builds a harness with a credential in the environment, a conformant spec, and every route of a whole run. */
function createHarness(options: HarnessOptions = {}): ReturnType<typeof createRunHarness> {
  return createRunHarness({
    env: { JIRA_API_TOKEN: 'a-token', JIRA_EMAIL: 'someone@example.com' },
    files: { [SPEC_PATH]: CONFORMANT_SPEC },
    ...options,
    routes: { ...buildRoutes(), ...options.routes },
  });
}

/** Runs `configure-project` through the whole command line, so that dispatch is exercised alongside it. */
async function runSubcommand(harness: ReturnType<typeof createRunHarness>, args: string[]): Promise<number> {
  return await run(['configure-project', ...args], harness.effects);
}

/** Builds every route walked by a whole run, against a team-managed project on one workflow. */
function buildRoutes(): FakeRoutes {
  return {
    'GET /rest/agile/1.0/board': { json: { values: [{ id: BOARD_ID, name: 'PROJ board' }] } },
    [`GET /rest/agile/1.0/board/${BOARD_ID}/configuration`]: {
      json: {
        columnConfig: {
          columns: [
            { name: 'To Do', statuses: [{ id: 'id-1' }] },
            { name: 'Done', statuses: [{ id: 'id-2' }] },
          ],
        },
      },
    },
    [`GET /rest/agile/1.0/board/${BOARD_ID}/features`]: {
      json: { features: [{ feature: 'jsw.agility.backlog', state: 'DISABLED' }] },
    },
    [`POST /rest/agile/1.0/backlog/${BOARD_ID}/issue`]: { status: 204 },
    'GET /rest/api/3/project/PROJ': { json: { id: PROJECT_ID, key: KEY, style: 'next-gen' } },
    'GET /rest/api/3/project/PROJ/statuses': { json: [{ id: '10001' }] },
    'GET /rest/api/3/statuses/search': { json: { values: [] } },
    'POST /rest/api/3/search/jql': { json: { issues: [{ key: 'PROJ-1' }, { key: 'PROJ-2' }] } },
    'POST /rest/api/3/workflows': {
      json: {
        statuses: [
          { description: '', id: 'id-1', name: 'To Do', statusCategory: 'TODO', statusReference: 'ref-1' },
          { description: '', id: 'id-2', name: 'Done', statusCategory: 'DONE', statusReference: 'ref-2' },
        ],
        workflows: [buildWorkflow()],
      },
    },
    'POST /rest/api/3/workflows/update': { json: {} },
    'PUT /rest/api/3/statuses': { json: {} },
  };
}

/** Builds the workflow graph narrowed by the read, reaching each status through a global transition named for it. */
function buildWorkflow(): unknown {
  return {
    description: 'The project workflow.',
    id: 'workflow-1',
    name: 'PROJ: Software Simplified Workflow',
    startPointLayout: { x: 0, y: 0 },
    statuses: [
      { layout: { x: 0, y: 0 }, statusReference: 'ref-1' },
      { layout: { x: 0, y: 60 }, statusReference: 'ref-2' },
    ],
    transitions: [
      { conditions: { operation: 'ALL' }, id: '10', name: 'To Do', toStatusReference: 'ref-1', type: 'GLOBAL' },
      { conditions: { operation: 'ALL' }, id: '20', name: 'Done', toStatusReference: 'ref-2', type: 'GLOBAL' },
    ],
    version: { id: 'version-1', versionNumber: 1 },
  };
}

// endregion | Helpers
