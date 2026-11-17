import { createTextBuffer, type Writer } from '@williamthorsen/toolbelt.cli/candidate';
import { describe, expect, it } from 'vitest';

import type { AddTrustOutcome, ListTrustOutcome, RevokeTrustOutcome } from '../../npm/createNpmClient.ts';
import type { TrustEntry } from '../../npm/parseTrustListing.ts';
import { run } from '../run.ts';
import { createNpmStub } from '../test-utils/createNpmStub.ts';

const NAME = '@scope/pkg';
const QUESTION = `Move the trusted publisher of ${NAME} to owner/new? [y/N] `;

const ENTRY: TrustEntry = {
  environment: 'npm',
  file: 'release.yaml',
  id: 'trust-1',
  permissions: ['createPackage', 'createStagedPackage'],
  repository: 'owner/old',
};

const SUMMARY = [
  `  Package: ${NAME}`,
  '  From: owner/old',
  '  To: owner/new',
  '  Workflow: release.yaml',
  '  Environment: npm',
  '  Permissions: publish, stage publish',
].join('\n');

describe('thor-npm move-trust', () => {
  describe('given a confirmed move', () => {
    it('writes the summary, asks, then revokes the old trust and adds the new one', async () => {
      const harness = createHarness({ answer: 'y' });

      const { exitCode, stderr } = await harness.run();

      expect(exitCode).toBe(0);
      expect(harness.events).toStrictEqual([
        'listTrust',
        'write summary',
        `ask ${QUESTION}`,
        'revokeTrust trust-1',
        'addGithubTrust owner/new',
        'write report',
      ]);
      expect(stderr).toBe(
        `${SUMMARY}\n  Mode: move\n` +
          `thor-npm move-trust: moved the trusted publisher of ${NAME} from owner/old to owner/new\n`,
      );
    });

    it('moves without asking under --force', async () => {
      const harness = createHarness();

      const { exitCode } = await harness.run(['--force']);

      expect(exitCode).toBe(0);
      expect(harness.events).toStrictEqual([
        'listTrust',
        'write summary',
        'revokeTrust trust-1',
        'addGithubTrust owner/new',
        'write report',
      ]);
    });
  });

  describe('given a run that changes nothing', () => {
    it.each([[['--dry-run']], [['--dry-run', '--force']]])('writes the summary and stops under %o', async (flags) => {
      const harness = createHarness();

      const { exitCode, stderr } = await harness.run(flags);

      expect(exitCode).toBe(0);
      expect(harness.events).toStrictEqual(['listTrust', 'write summary', 'write report']);
      expect(stderr).toBe(`${SUMMARY}\n  Mode: dry run\nthor-npm move-trust: nothing was changed (dry run)\n`);
    });

    it.each([['n'], [''], [undefined]])('stops when the answer is %o', async (answer) => {
      const harness = createHarness({ answer });

      const { exitCode, stderr } = await harness.run();

      expect(exitCode).toBe(1);
      expect(harness.events).toStrictEqual(['listTrust', 'write summary', `ask ${QUESTION}`, 'write report']);
      expect(stderr).toMatch(/\nthor-npm move-trust: nothing was changed\n$/);
    });
  });

  describe('given a trust that cannot be moved', () => {
    it.each([
      { listing: { kind: 'missing' }, exitCode: 127, message: 'npm not found on PATH' },
      {
        listing: { kind: 'failed', detail: 'exit 1' },
        exitCode: 1,
        message: `could not list the trusted publishers of '${NAME}': exit 1; nothing was changed`,
      },
      {
        listing: { kind: 'listed', entries: [], otherCount: 0 },
        exitCode: 1,
        message: `'${NAME}' has no trusted publisher; npm trust github adds one; nothing was changed`,
      },
    ] satisfies Array<{ listing: ListTrustOutcome; exitCode: number; message: string }>)(
      'refuses before the summary: $message',
      async ({ listing, exitCode, message }) => {
        const harness = createHarness({ listing });

        const result = await harness.run(['--force']);

        expect(result.exitCode).toBe(exitCode);
        expect(harness.events).toStrictEqual(['listTrust', 'write report']);
        expect(result.stderr).toContain(`thor-npm move-trust: ${message}`);
      },
    );

    it('exits 2 for a usage problem, before calling npm', async () => {
      const harness = createHarness({ isStdoutTty: false });

      const { exitCode, stderr } = await harness.run(['--force']);

      expect(exitCode).toBe(2);
      expect(harness.events).not.toContain('listTrust');
      expect(stderr).toContain('needs a terminal on stdin and stdout');
    });
  });

  describe('given a failure after the listing', () => {
    it('stops before adding when the revoke fails', async () => {
      const harness = createHarness({ revoke: { kind: 'failed', detail: 'exit 1' } });

      const { exitCode, stderr } = await harness.run(['--force']);

      expect(exitCode).toBe(1);
      expect(harness.events).toStrictEqual(['listTrust', 'write summary', 'revokeTrust trust-1', 'write report']);
      expect(stderr).toContain('thor-npm move-trust: npm trust revoke failed (exit 1); nothing was changed\n');
    });

    it('writes the restoring line before it restores the old trust', async () => {
      const harness = createHarness({ adds: [{ kind: 'failed', detail: 'exit 1' }, { kind: 'added' }] });

      const { exitCode, stderr } = await harness.run(['--force']);

      expect(exitCode).toBe(1);
      expect(harness.events).toStrictEqual([
        'listTrust',
        'write summary',
        'revokeTrust trust-1',
        'addGithubTrust owner/new',
        'write report',
        'addGithubTrust owner/old',
        'write report',
      ]);
      expect(stderr).toContain(
        'thor-npm move-trust: npm trust github failed (exit 1); restoring the trusted publisher for owner/old\n' +
          'thor-npm move-trust: restored the trusted publisher for owner/old; nothing was moved\n',
      );
    });

    it('prints the command that restores the old trust when the restore fails too', async () => {
      const harness = createHarness({
        adds: [
          { kind: 'failed', detail: 'exit 1' },
          { kind: 'failed', detail: 'signal SIGINT' },
        ],
      });

      const { exitCode, stderr } = await harness.run(['--force']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain(
        `thor-npm move-trust: restoring failed (signal SIGINT); ${NAME} has no trusted publisher. Restore it with:\n` +
          `  npm trust github ${NAME} --repo owner/old --file release.yaml --env npm --allow-publish --allow-stage-publish --yes\n`,
      );
    });
  });
});

// region | Helpers

/**
 * Creates stub effects whose npm lists one movable trust and accepts every change unless the settings say otherwise.
 * Each npm call, question, and stderr write is recorded as an event, in order; a write is recorded as `summary` or
 * `report` by whether it is a prefixed line.
 */
function createHarness(settings: HarnessSettings = {}): Harness {
  const adds = [...(settings.adds ?? [])];
  const events: string[] = [];
  const buffer = createTextBuffer();
  const stderr: Writer = {
    write: (text: string) => {
      events.push(text.startsWith('thor-npm') ? 'write report' : 'write summary');
      buffer.write(text);
    },
  };

  const npm = createNpmStub({
    addGithubTrust: (_name, trust) => {
      events.push(`addGithubTrust ${trust.repository}`);
      return adds.shift() ?? { kind: 'added' };
    },
    listTrust: () => {
      events.push('listTrust');
      return settings.listing ?? { kind: 'listed', entries: [ENTRY], otherCount: 0 };
    },
    revokeTrust: (_name, id) => {
      events.push(`revokeTrust ${id}`);
      return settings.revoke ?? { kind: 'revoked' };
    },
  });

  return {
    events,
    async run(flags = []) {
      const exitCode = await run(
        ['move-trust', NAME, '--from', 'owner/old', '--to', 'owner/new', ...flags],
        {
          createTempDir: () => {
            throw new Error('Unexpected createTempDir call');
          },
          cwd: () => {
            throw new Error('Unexpected cwd call');
          },
          isStdinTty: () => true,
          isStdoutTty: () => settings.isStdoutTty ?? true,
          npm,
          readAnswer: (question) => {
            events.push(`ask ${question}`);
            return Promise.resolve(settings.answer);
          },
          resolveVersion: () => '0.0.0',
          stdoutColumns: () => undefined,
        },
        { stderr, stdout: createTextBuffer() },
      );

      return { exitCode, stderr: buffer.text };
    },
  };
}

/** Stub effects, with the events that they recorded. */
interface Harness {
  readonly events: string[];
  readonly run: (flags?: string[]) => Promise<{ exitCode: number; stderr: string }>;
}

/** How the stub npm answers, in order for each add, and how the effects behave. */
interface HarnessSettings {
  readonly adds?: AddTrustOutcome[];
  readonly answer?: string | undefined;
  readonly isStdoutTty?: boolean;
  readonly listing?: ListTrustOutcome;
  readonly revoke?: RevokeTrustOutcome;
}

// endregion | Helpers
