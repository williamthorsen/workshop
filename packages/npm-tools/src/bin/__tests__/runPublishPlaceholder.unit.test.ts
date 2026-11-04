import fs from 'node:fs';
import path from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { FindVersionOutcome, NpmClient, PublishOutcome, WhoamiOutcome } from '../../npm/createNpmClient.ts';
import { type PublishPlaceholderOptions, runPublishPlaceholder } from '../runPublishPlaceholder.ts';
import { createTextBuffer } from '../test-utils/createTextBuffer.ts';

const NAME = '@scope/new-pkg';

describe(runPublishPlaceholder, () => {
  describe('given a confirmed publish', () => {
    it('publishes the placeholder, then removes its directory', async () => {
      using harness = createHarness({ answer: 'y' });

      const { exitCode, stderr } = await harness.run();

      expect(exitCode).toBe(0);
      expect(harness.published).toHaveLength(1);
      expect(harness.published[0]?.files).toStrictEqual({
        'README.md': `Placeholder for \`${NAME}\`, awaiting first release.\n`,
        'package.json': `{\n  "name": "${NAME}",\n  "version": "0.0.0"\n}\n`,
      });
      expect(stderr).toContain(`  Package: ${NAME}\n`);
      expect(stderr).toContain('  Mode: publish\n');
      expect(stderr).toContain(`thor-npm publish-placeholder: published ${NAME}@0.0.0\n`);
      expect(harness.leftoverDirs()).toStrictEqual([]);
    });

    it.each([['yes'], ['Y'], [' YES ']])('accepts %o as confirmation', async (answer) => {
      using harness = createHarness({ answer });

      await expect(harness.run()).resolves.toMatchObject({ exitCode: 0 });
      expect(harness.published).toHaveLength(1);
    });

    it('publishes without asking under --force, even without a terminal', async () => {
      using harness = createHarness({ isStdinTty: false });

      const { exitCode } = await harness.run({ force: true });

      expect(exitCode).toBe(0);
      expect(harness.questions).toStrictEqual([]);
      expect(harness.published).toHaveLength(1);
    });
  });

  describe('given a run that does not publish', () => {
    it('reports a dry run without a terminal, and removes the directory', async () => {
      using harness = createHarness({ isStdinTty: false });

      const { exitCode, stderr } = await harness.run({ dryRun: true });

      expect(exitCode).toBe(0);
      expect(stderr).toContain('  Mode: dry run\n');
      expect(stderr).toContain('thor-npm publish-placeholder: nothing was published (dry run)\n');
      expect(harness.questions).toStrictEqual([]);
      expect(harness.published).toStrictEqual([]);
      expect(harness.leftoverDirs()).toStrictEqual([]);
    });

    it('publishes nothing under --dry-run with --force', async () => {
      using harness = createHarness();

      await expect(harness.run({ dryRun: true, force: true })).resolves.toMatchObject({ exitCode: 0 });
      expect(harness.published).toStrictEqual([]);
    });

    it.each([['n'], [''], [undefined]])('exits 1 when the answer is %o', async (answer) => {
      using harness = createHarness({ answer });

      const { exitCode, stderr } = await harness.run();

      expect(exitCode).toBe(1);
      expect(harness.questions).toStrictEqual([`Publish ${NAME}@0.0.0? [y/N] `]);
      expect(stderr).toContain('thor-npm publish-placeholder: nothing was published\n');
      expect(harness.published).toStrictEqual([]);
      expect(harness.leftoverDirs()).toStrictEqual([]);
    });
  });

  describe('given a failed check', () => {
    it('refuses a non-terminal stdin without --force or --dry-run, before calling npm', async () => {
      using harness = createHarness({ isStdinTty: false });

      await expect(harness.run()).rejects.toThrow(/needs a terminal on stdin; pass --force/);
      expect(harness.npmCalls).toStrictEqual([]);
    });

    it("refuses an invalid name with npm's reasons, before calling npm", async () => {
      using harness = createHarness();

      await expect(harness.run({ name: 'node_modules' })).rejects.toThrow(
        /invalid package name 'node_modules':\n {2}node_modules is not a valid package name/,
      );
      expect(harness.npmCalls).toStrictEqual([]);
    });

    it.each([
      {
        case: 'npm is missing',
        npm: { whoami: { kind: 'missing' } },
        exitCode: 127,
        message: 'npm not found on PATH; install Node.js with npm, then run this again',
      },
      {
        case: 'npm is logged out',
        npm: { whoami: { kind: 'logged-out', detail: 'need auth' } },
        exitCode: 1,
        message: 'not logged in to npm (need auth); run npm login, then run this again',
      },
      {
        case: 'the name exists',
        npm: { findVersion: { kind: 'found' } },
        exitCode: 1,
        message: `'${NAME}' already exists on the registry; a placeholder is only for a new name`,
      },
      {
        case: 'the registry cannot be queried',
        npm: { findVersion: { kind: 'failed', detail: 'request failed' } },
        exitCode: 1,
        message: `could not query the registry for '${NAME}': request failed`,
      },
    ] as const)('exits $exitCode when $case', async ({ exitCode, message, npm }) => {
      using harness = createHarness({ answer: 'y', npm });

      const result = await harness.run();

      expect(result.exitCode).toBe(exitCode);
      expect(result.stderr).toBe(`thor-npm publish-placeholder: ${message}\n`);
      expect(harness.published).toStrictEqual([]);
      expect(harness.leftoverDirs()).toStrictEqual([]);
    });

    it('reports a failed publish and removes the directory', async () => {
      using harness = createHarness({ answer: 'y', npm: { publish: { kind: 'failed', detail: 'exit 1' } } });

      const { exitCode, stderr } = await harness.run();

      expect(exitCode).toBe(1);
      expect(stderr).toContain('thor-npm publish-placeholder: npm publish failed (exit 1); nothing was published\n');
      expect(harness.leftoverDirs()).toStrictEqual([]);
    });
  });
});

// region | Helpers

interface Harness extends Disposable {
  /** Lists the directories that `createTempDir` made and that still exist. */
  readonly leftoverDirs: () => string[];
  readonly npmCalls: string[];
  /** Each publish, with the files that the published directory held at that moment. */
  readonly published: Array<{ files: Record<string, string> }>;
  readonly questions: string[];
  readonly run: (options?: Partial<PublishPlaceholderOptions>) => Promise<{ exitCode: number; stderr: string }>;
}

interface HarnessSettings {
  readonly answer?: string | undefined;
  readonly isStdinTty?: boolean;
  readonly npm?: {
    readonly findVersion?: FindVersionOutcome;
    readonly publish?: PublishOutcome;
    readonly whoami?: WhoamiOutcome;
  };
}

/** Creates stub effects whose npm finds a free name and a logged-in session unless the settings say otherwise. */
function createHarness(settings: HarnessSettings = {}): Harness {
  const tree: TempTree = createTempTree({ 'tmp/': '' });
  const createdDirs: string[] = [];
  const npmCalls: string[] = [];
  const published: Array<{ files: Record<string, string> }> = [];
  const questions: string[] = [];

  const npm: NpmClient = {
    addGithubTrust: () => ({ kind: 'failed', detail: 'unexpected addGithubTrust' }),
    findVersion: (name) => {
      npmCalls.push(`view ${name}`);
      return settings.npm?.findVersion ?? { kind: 'absent' };
    },
    listTrust: () => ({ kind: 'failed', detail: 'unexpected listTrust' }),
    publish: (dir) => {
      npmCalls.push('publish');
      published.push({ files: readFiles(dir) });
      return settings.npm?.publish ?? { kind: 'published' };
    },
    revokeTrust: () => ({ kind: 'failed', detail: 'unexpected revokeTrust' }),
    whoami: () => {
      npmCalls.push('whoami');
      return settings.npm?.whoami ?? { kind: 'logged-in', username: 'someone' };
    },
  };

  return {
    leftoverDirs: () => createdDirs.filter((dir) => fs.existsSync(dir)),
    npmCalls,
    published,
    questions,
    async run(options = {}) {
      const stderr = createTextBuffer();
      const exitCode = await runPublishPlaceholder(
        { dryRun: false, force: false, name: NAME, ...options },
        {
          createTempDir: () => {
            const dir = fs.mkdtempSync(path.join(tree.resolve('tmp'), 'placeholder-'));
            createdDirs.push(dir);
            return dir;
          },
          isStdinTty: () => settings.isStdinTty ?? true,
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
    [Symbol.dispose]() {
      tree[Symbol.dispose]();
    },
  };
}

/** Reads every file directly inside a directory, keyed by name. */
function readFiles(dir: string): Record<string, string> {
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .toSorted()
      .map((file) => [file, fs.readFileSync(path.join(dir, file), 'utf8')]),
  );
}

// endregion | Helpers
