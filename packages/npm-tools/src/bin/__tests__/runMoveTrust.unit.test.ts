import { UsageError } from '@williamthorsen/toolbelt.cli/candidate';
import { describe, expect, it } from 'vitest';

import type {
  AddTrustOutcome,
  GithubTrust,
  ListTrustOutcome,
  NpmClient,
  RevokeTrustOutcome,
} from '../../npm/createNpmClient.ts';
import type { TrustEntry } from '../../npm/parseTrustListing.ts';
import { type MoveTrustOptions, runMoveTrust } from '../runMoveTrust.ts';
import { createTextBuffer } from '../test-utils/createTextBuffer.ts';

const NAME = '@scope/pkg';

const ENTRY: TrustEntry = {
  environment: 'npm',
  file: 'release.yaml',
  id: 'trust-1',
  permissions: ['createPackage', 'createStagedPackage'],
  repository: 'owner/old',
};

const OLD_TRUST: GithubTrust = {
  environment: 'npm',
  file: 'release.yaml',
  permissions: ['createPackage', 'createStagedPackage'],
  repository: 'owner/old',
};

describe(runMoveTrust, () => {
  describe('given a confirmed move', () => {
    it('revokes the old trust, then adds the new one with the same file, environment, and permissions', async () => {
      const harness = createHarness({ answer: 'y' });

      const { exitCode, stderr } = await harness.run();

      expect(exitCode).toBe(0);
      expect(harness.calls).toStrictEqual([
        { method: 'listTrust', args: [NAME] },
        { method: 'revokeTrust', args: [NAME, 'trust-1'] },
        { method: 'addGithubTrust', args: [NAME, { ...OLD_TRUST, repository: 'owner/new' }] },
      ]);
      expect(harness.questions).toStrictEqual([`Move the trusted publisher of ${NAME} to owner/new? [y/N] `]);
      expect(stderr).toContain(
        [
          `  Package: ${NAME}`,
          '  From: owner/old',
          '  To: owner/new',
          '  Workflow: release.yaml',
          '  Environment: npm',
          '  Permissions: publish, stage publish',
          '  Mode: move',
        ].join('\n'),
      );
      expect(stderr).toContain(
        `thor-npm move-trust: moved the trusted publisher of ${NAME} from owner/old to owner/new\n`,
      );
    });

    it('takes the workflow file that --file names, showing the change in the summary', async () => {
      const harness = createHarness();

      const { exitCode, stderr } = await harness.run({ file: 'publish.yml', force: true });

      expect(exitCode).toBe(0);
      expect(harness.calls.at(-1)).toStrictEqual({
        method: 'addGithubTrust',
        args: [NAME, { ...OLD_TRUST, file: 'publish.yml', repository: 'owner/new' }],
      });
      expect(stderr).toContain('  Workflow: release.yaml → publish.yml\n');
    });

    it('omits the environment when the old trust has none', async () => {
      const { environment: _, ...entry } = ENTRY;
      const harness = createHarness({ listing: listed([entry]) });

      const { stderr } = await harness.run({ force: true });

      const { environment: __, ...trust } = OLD_TRUST;
      expect(harness.calls.at(-1)).toStrictEqual({
        method: 'addGithubTrust',
        args: [NAME, { ...trust, repository: 'owner/new' }],
      });
      expect(stderr).toContain('  Environment: none\n');
    });

    it('matches --from without regard to case', async () => {
      const harness = createHarness();

      await expect(harness.run({ force: true, from: 'Owner/Old' })).resolves.toMatchObject({ exitCode: 0 });
    });
  });

  describe('given a run that changes nothing', () => {
    it('prints the summary and stops under --dry-run', async () => {
      const harness = createHarness();

      const { exitCode, stderr } = await harness.run({ dryRun: true });

      expect(exitCode).toBe(0);
      expect(harness.calls.map(({ method }) => method)).toStrictEqual(['listTrust']);
      expect(stderr).toContain('  Mode: dry run\n');
      expect(stderr).toContain('thor-npm move-trust: nothing was changed (dry run)\n');
    });

    it.each([['n'], [''], [undefined]])('stops when the answer is %o', async (answer) => {
      const harness = createHarness({ ...(answer !== undefined && { answer }) });

      const { exitCode, stderr } = await harness.run();

      expect(exitCode).toBe(1);
      expect(harness.calls.map(({ method }) => method)).toStrictEqual(['listTrust']);
      expect(stderr).toContain('thor-npm move-trust: nothing was changed\n');
    });
  });

  describe('given a usage problem', () => {
    it.each([
      { isStdinTty: false, isStdoutTty: true },
      { isStdinTty: true, isStdoutTty: false },
    ])('refuses without a terminal on both streams, even under --force ($isStdinTty, $isStdoutTty)', async (ttys) => {
      const harness = createHarness(ttys);

      await expect(harness.run({ force: true })).rejects.toThrow(/needs a terminal on stdin and stdout/);
      expect(harness.calls).toStrictEqual([]);
    });

    it.each([
      { options: { name: 'Bad Name' }, message: /invalid package name 'Bad Name'/ },
      { options: { from: 'owner' }, message: /--from takes an owner\/repo name, not 'owner'/ },
      { options: { to: 'a/b/c' }, message: /--to takes an owner\/repo name, not 'a\/b\/c'/ },
      { options: { to: 'OWNER/old' }, message: /--from and --to both name owner\/old/ },
      { options: { file: '.github/workflows/release.yaml' }, message: /--file takes a workflow file name/ },
      { options: { file: 'release.json' }, message: /--file takes a workflow file name/ },
    ] satisfies Array<{ options: Partial<MoveTrustOptions>; message: RegExp }>)(
      'throws a usage error for $options',
      async ({ options, message }) => {
        const harness = createHarness();

        const outcome = harness.run({ force: true, ...options });

        await expect(outcome).rejects.toThrow(UsageError);
        await expect(outcome).rejects.toThrow(message);
        expect(harness.calls).toStrictEqual([]);
      },
    );
  });

  describe('given a trust that cannot be moved', () => {
    it.each([
      { listing: listed([]), reason: `'${NAME}' has no trusted publisher; npm trust github adds one` },
      { listing: listed([ENTRY], 1), reason: `'${NAME}' has a trusted publisher that is not on GitHub` },
      {
        listing: listed([ENTRY, { ...ENTRY, id: 'trust-2' }]),
        reason: `'${NAME}' has more than one trusted publisher`,
      },
      {
        listing: listed([{ ...ENTRY, repository: 'owner/elsewhere' }]),
        reason: `the trusted publisher of '${NAME}' is owner/elsewhere, not owner/old`,
      },
      {
        listing: listed([{ id: 'trust-1', permissions: ['createPackage'], repository: 'owner/old' }]),
        reason: `the trusted publisher of '${NAME}' names no workflow file, so it could not be restored`,
      },
      {
        listing: listed([{ ...ENTRY, permissions: [] }]),
        reason: `the trusted publisher of '${NAME}' lists no permissions, so it could not be restored`,
      },
      {
        listing: listed([{ ...ENTRY, permissions: ['createPackage', 'adminEverything'] }]),
        reason: `the trusted publisher of '${NAME}' has a permission that thor-npm cannot grant (adminEverything), so it could not be restored`,
      },
    ])('refuses before revoking: $reason', async ({ listing, reason }) => {
      const harness = createHarness({ listing });

      const { exitCode, stderr } = await harness.run({ force: true });

      expect(exitCode).toBe(1);
      expect(harness.calls.map(({ method }) => method)).toStrictEqual(['listTrust']);
      expect(stderr).toBe(`thor-npm move-trust: ${reason}; nothing was changed\n`);
    });

    it('exits 127 when npm is missing', async () => {
      const harness = createHarness({ listing: { kind: 'missing' } });

      const { exitCode, stderr } = await harness.run({ force: true });

      expect(exitCode).toBe(127);
      expect(stderr).toContain('npm not found on PATH');
    });

    it('reports a failed listing', async () => {
      const harness = createHarness({ listing: { kind: 'failed', detail: 'exit 1' } });

      const { exitCode, stderr } = await harness.run({ force: true });

      expect(exitCode).toBe(1);
      expect(stderr).toBe(
        `thor-npm move-trust: could not list the trusted publishers of '${NAME}': exit 1; nothing was changed\n`,
      );
    });
  });

  describe('given a failure after the listing', () => {
    it('stops before adding when the revoke fails', async () => {
      const harness = createHarness({ revoke: { kind: 'failed', detail: 'exit 1' } });

      const { exitCode, stderr } = await harness.run({ force: true });

      expect(exitCode).toBe(1);
      expect(harness.calls.map(({ method }) => method)).toStrictEqual(['listTrust', 'revokeTrust']);
      expect(stderr).toContain('thor-npm move-trust: npm trust revoke failed (exit 1); nothing was changed\n');
    });

    it('restores the old trust when the add fails', async () => {
      const harness = createHarness({ adds: [{ kind: 'failed', detail: 'exit 1' }, { kind: 'added' }] });

      const { exitCode, stderr } = await harness.run({ force: true });

      expect(exitCode).toBe(1);
      expect(harness.calls).toStrictEqual([
        { method: 'listTrust', args: [NAME] },
        { method: 'revokeTrust', args: [NAME, 'trust-1'] },
        { method: 'addGithubTrust', args: [NAME, { ...OLD_TRUST, repository: 'owner/new' }] },
        { method: 'addGithubTrust', args: [NAME, OLD_TRUST] },
      ]);
      expect(stderr).toContain(
        'thor-npm move-trust: npm trust github failed (exit 1); restoring the trusted publisher for owner/old\n',
      );
      expect(stderr).toContain(
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

      const { exitCode, stderr } = await harness.run({ force: true });

      expect(exitCode).toBe(1);
      expect(stderr).toContain(
        `thor-npm move-trust: restoring failed (signal SIGINT); ${NAME} has no trusted publisher. Restore it with:\n` +
          `  npm trust github ${NAME} --repo owner/old --file release.yaml --env npm --allow-publish --allow-stage-publish --yes\n`,
      );
    });
  });
});

// region | Helpers

/** Creates a fake client and effects, recording each client call and each question asked. */
function createHarness(settings: HarnessSettings = {}): Harness {
  const adds = [...(settings.adds ?? [])];
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const questions: string[] = [];

  const npm: NpmClient = {
    addGithubTrust: (name, trust) => {
      calls.push({ method: 'addGithubTrust', args: [name, trust] });
      return adds.shift() ?? { kind: 'added' };
    },
    findVersion: () => ({ kind: 'failed', detail: 'unexpected findVersion' }),
    listTrust: (name) => {
      calls.push({ method: 'listTrust', args: [name] });
      return settings.listing ?? listed([ENTRY]);
    },
    publish: () => ({ kind: 'failed', detail: 'unexpected publish' }),
    revokeTrust: (name, id) => {
      calls.push({ method: 'revokeTrust', args: [name, id] });
      return settings.revoke ?? { kind: 'revoked' };
    },
    whoami: () => ({ kind: 'missing' }),
  };

  return {
    calls,
    questions,
    async run(options = {}) {
      const stderr = createTextBuffer();
      const exitCode = await runMoveTrust(
        { dryRun: false, force: false, from: 'owner/old', name: NAME, to: 'owner/new', ...options },
        {
          isStdinTty: () => settings.isStdinTty ?? true,
          isStdoutTty: () => settings.isStdoutTty ?? true,
          npm,
          readAnswer: (question) => {
            questions.push(question);
            return Promise.resolve(settings.answer);
          },
        },
        { stderr },
      );

      return { exitCode, stderr: stderr.text };
    },
  };
}

/** Returns a successful listing of the given entries. */
function listed(entries: TrustEntry[], otherCount = 0): ListTrustOutcome {
  return { kind: 'listed', entries, otherCount };
}

/** A fake client and effects, with what they observed. */
interface Harness {
  readonly calls: Array<{ method: string; args: unknown[] }>;
  readonly questions: string[];
  readonly run: (options?: Partial<MoveTrustOptions>) => Promise<{ exitCode: number; stderr: string }>;
}

/** How the fake client answers, in order for each add, and how the effects behave. */
interface HarnessSettings {
  readonly adds?: AddTrustOutcome[];
  readonly answer?: string;
  readonly isStdinTty?: boolean;
  readonly isStdoutTty?: boolean;
  readonly listing?: ListTrustOutcome;
  readonly revoke?: RevokeTrustOutcome;
}

// endregion | Helpers
