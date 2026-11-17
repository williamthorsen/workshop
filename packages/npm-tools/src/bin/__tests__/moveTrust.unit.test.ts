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
import {
  applyMoveTrust,
  type MoveTrustOptions,
  planMoveTrust,
  type ReadyMoveTrustPlan,
  restoreTrust,
} from '../moveTrust.ts';
import { createNpmStub } from '../test-utils/createNpmStub.ts';

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

const READY_PLAN: ReadyMoveTrustPlan = {
  kind: 'ready',
  id: 'trust-1',
  name: NAME,
  newTrust: { ...OLD_TRUST, repository: 'owner/new' },
  oldTrust: OLD_TRUST,
};

describe(applyMoveTrust, () => {
  it('revokes the old trust, then adds the new one', () => {
    const harness = createHarness();

    expect(applyMoveTrust(READY_PLAN, harness)).toStrictEqual({ kind: 'moved' });
    expect(harness.calls).toStrictEqual([
      { method: 'revokeTrust', args: [NAME, 'trust-1'] },
      { method: 'addGithubTrust', args: [NAME, READY_PLAN.newTrust] },
    ]);
  });

  it('stops before adding when the revoke fails', () => {
    const harness = createHarness({ revoke: { kind: 'failed', detail: 'exit 1' } });

    expect(applyMoveTrust(READY_PLAN, harness)).toStrictEqual({ kind: 'revoke-failed', detail: 'exit 1' });
    expect(harness.calls.map(({ method }) => method)).toStrictEqual(['revokeTrust']);
  });

  it('reports a failed add without restoring', () => {
    const harness = createHarness({ adds: [{ kind: 'failed', detail: 'exit 1' }] });

    expect(applyMoveTrust(READY_PLAN, harness)).toStrictEqual({ kind: 'add-failed', detail: 'exit 1' });
    expect(harness.calls.map(({ method }) => method)).toStrictEqual(['revokeTrust', 'addGithubTrust']);
  });
});

describe(planMoveTrust, () => {
  it('is ready with the old trust and the new one, which keeps its file, environment, and permissions', () => {
    const harness = createHarness();

    expect(harness.plan()).toStrictEqual(READY_PLAN);
    expect(harness.calls).toStrictEqual([{ method: 'listTrust', args: [NAME] }]);
  });

  it('takes the workflow file that --file names', () => {
    const harness = createHarness();

    expect(harness.plan({ file: 'publish.yml' })).toMatchObject({
      newTrust: { ...OLD_TRUST, file: 'publish.yml', repository: 'owner/new' },
      oldTrust: OLD_TRUST,
    });
  });

  it('omits the environment when the old trust has none', () => {
    const { environment: _, ...entry } = ENTRY;
    const harness = createHarness({ listing: buildListing([entry]) });

    const { environment: __, ...trust } = OLD_TRUST;
    expect(harness.plan()).toMatchObject({ newTrust: { ...trust, repository: 'owner/new' }, oldTrust: trust });
  });

  it('matches --from without regard to case', () => {
    const harness = createHarness();

    expect(harness.plan({ from: 'Owner/Old' })).toMatchObject({ kind: 'ready' });
  });

  it.each([
    { isStdinTty: false, isStdoutTty: true },
    { isStdinTty: true, isStdoutTty: false },
  ])('refuses without a terminal on both streams ($isStdinTty, $isStdoutTty)', (ttys) => {
    const harness = createHarness(ttys);

    expect(() => harness.plan()).toThrow(/needs a terminal on stdin and stdout/);
    expect(harness.calls).toStrictEqual([]);
  });

  it.each([
    { options: { name: 'Bad Name' }, message: /invalid package name 'Bad Name'/ },
    { options: { from: undefined }, message: /--from <owner\/repo> is required/ },
    { options: { from: 'owner' }, message: /--from takes an owner\/repo name, not 'owner'/ },
    { options: { to: 'a/b/c' }, message: /--to takes an owner\/repo name, not 'a\/b\/c'/ },
    { options: { to: 'OWNER/old' }, message: /--from and --to both name owner\/old/ },
    { options: { file: '.github/workflows/release.yaml' }, message: /--file takes a workflow file name/ },
    { options: { file: 'release.json' }, message: /--file takes a workflow file name/ },
  ] satisfies Array<{ options: Partial<MoveTrustOptions>; message: RegExp }>)(
    'throws a usage error for $options',
    ({ options, message }) => {
      const harness = createHarness();

      expect(() => harness.plan(options)).toThrow(UsageError);
      expect(() => harness.plan(options)).toThrow(message);
      expect(harness.calls).toStrictEqual([]);
    },
  );

  it.each([
    { listing: { kind: 'missing' }, expected: { kind: 'npm-missing' } },
    {
      listing: { kind: 'failed', detail: 'exit 1' },
      expected: { kind: 'listing-failed', detail: 'exit 1', name: NAME },
    },
  ] satisfies Array<{ listing: ListTrustOutcome; expected: unknown }>)(
    'reports a listing that is $listing.kind',
    ({ listing, expected }) => {
      const harness = createHarness({ listing });

      expect(harness.plan()).toStrictEqual(expected);
    },
  );

  it.each([
    { listing: buildListing([]), reason: `'${NAME}' has no trusted publisher; npm trust github adds one` },
    { listing: buildListing([ENTRY], 1), reason: `'${NAME}' has a trusted publisher that is not on GitHub` },
    {
      listing: buildListing([ENTRY, { ...ENTRY, id: 'trust-2' }]),
      reason: `'${NAME}' has more than one trusted publisher`,
    },
    {
      listing: buildListing([{ ...ENTRY, repository: 'owner/elsewhere' }]),
      reason: `the trusted publisher of '${NAME}' is owner/elsewhere, not owner/old`,
    },
    {
      listing: buildListing([{ id: 'trust-1', permissions: ['createPackage'], repository: 'owner/old' }]),
      reason: `the trusted publisher of '${NAME}' names no workflow file, so it could not be restored`,
    },
    {
      listing: buildListing([{ ...ENTRY, permissions: [] }]),
      reason: `the trusted publisher of '${NAME}' lists no permissions, so it could not be restored`,
    },
    {
      listing: buildListing([{ ...ENTRY, permissions: ['createPackage', 'adminEverything'] }]),
      reason: `the trusted publisher of '${NAME}' has a permission that thor-npm cannot grant (adminEverything), so it could not be restored`,
    },
  ])('refuses: $reason', ({ listing, reason }) => {
    const harness = createHarness({ listing });

    expect(harness.plan()).toStrictEqual({ kind: 'refused', reason });
  });
});

describe(restoreTrust, () => {
  it('adds the old trust back', () => {
    const harness = createHarness();

    expect(restoreTrust(READY_PLAN, harness)).toStrictEqual({ kind: 'restored' });
    expect(harness.calls).toStrictEqual([{ method: 'addGithubTrust', args: [NAME, OLD_TRUST] }]);
  });

  it('reports a failed restore', () => {
    const harness = createHarness({ adds: [{ kind: 'failed', detail: 'signal SIGINT' }] });

    expect(restoreTrust(READY_PLAN, harness)).toStrictEqual({ kind: 'failed', detail: 'signal SIGINT' });
  });
});

// region | Helpers

/** Returns a successful listing of the given entries. */
function buildListing(entries: TrustEntry[], otherCount = 0): ListTrustOutcome {
  return { kind: 'listed', entries, otherCount };
}

/** Creates a fake client and effects, recording each client call. */
function createHarness(settings: HarnessSettings = {}): Harness {
  const adds = [...(settings.adds ?? [])];
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const npm = createNpmStub({
    addGithubTrust: (name, trust) => {
      calls.push({ method: 'addGithubTrust', args: [name, trust] });
      return adds.shift() ?? { kind: 'added' };
    },
    listTrust: (name) => {
      calls.push({ method: 'listTrust', args: [name] });
      return settings.listing ?? buildListing([ENTRY]);
    },
    revokeTrust: (name, id) => {
      calls.push({ method: 'revokeTrust', args: [name, id] });
      return settings.revoke ?? { kind: 'revoked' };
    },
  });
  const effects = {
    isStdinTty: () => settings.isStdinTty ?? true,
    isStdoutTty: () => settings.isStdoutTty ?? true,
    npm,
  };

  return {
    ...effects,
    calls,
    plan: (options = {}) =>
      planMoveTrust(
        { dryRun: false, force: false, from: 'owner/old', name: NAME, to: 'owner/new', ...options },
        effects,
      ),
  };
}

/** A fake client and effects, with the calls that the client observed. */
interface Harness {
  readonly calls: Array<{ method: string; args: unknown[] }>;
  readonly isStdinTty: () => boolean;
  readonly isStdoutTty: () => boolean;
  readonly npm: NpmClient;
  readonly plan: (options?: Partial<MoveTrustOptions>) => ReturnType<typeof planMoveTrust>;
}

/** How the fake client answers, in order for each add, and how the effects behave. */
interface HarnessSettings {
  readonly adds?: AddTrustOutcome[];
  readonly isStdinTty?: boolean;
  readonly isStdoutTty?: boolean;
  readonly listing?: ListTrustOutcome;
  readonly revoke?: RevokeTrustOutcome;
}

// endregion | Helpers
