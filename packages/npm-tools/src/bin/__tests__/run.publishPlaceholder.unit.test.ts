import fs from 'node:fs';
import path from 'node:path';

import { createTextBuffer } from '@williamthorsen/toolbelt.cli/candidate';
import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { FindVersionOutcome, PublishOutcome, WhoamiOutcome } from '../../npm/createNpmClient.ts';
import { run } from '../run.ts';
import { createNpmStub } from '../test-utils/createNpmStub.ts';

const NAME = '@scope/new-pkg';
const QUESTION = `Publish ${NAME}@0.0.0? [y/N] `;

describe('thor-npm publish-placeholder', () => {
  describe('given a confirmed publish', () => {
    it('writes the summary, asks, then publishes and removes the directory', async () => {
      using harness = createHarness({ answer: 'y' });

      const { exitCode, stderr } = await harness.run();

      expect(exitCode).toBe(0);
      expect(harness.events).toStrictEqual(['whoami', `view ${NAME}`, `ask ${QUESTION}`, 'publish']);
      expect(stderr).toBe(
        [
          `  Package: ${NAME}`,
          '  Version: 0.0.0',
          '  Access: public',
          '  Files: package.json, README.md',
          '  Mode: publish',
          `thor-npm publish-placeholder: published ${NAME}@0.0.0`,
          '',
        ].join('\n'),
      );
      expect(harness.stderrBeforeQuestion).toContain('  Mode: publish\n');
      expect(harness.leftoverDirs()).toStrictEqual([]);
    });

    it.each([['yes'], ['Y'], [' YES ']])('accepts %o as confirmation', async (answer) => {
      using harness = createHarness({ answer });

      await expect(harness.run()).resolves.toMatchObject({ exitCode: 0 });
      expect(harness.events).toContain('publish');
    });

    it('publishes without asking under --force, even without a terminal', async () => {
      using harness = createHarness({ isStdinTty: false });

      const { exitCode } = await harness.run(['--force']);

      expect(exitCode).toBe(0);
      expect(harness.events).toStrictEqual(['whoami', `view ${NAME}`, 'publish']);
    });
  });

  describe('given a run that does not publish', () => {
    it.each([[['--dry-run']], [['--dry-run', '--force']]])(
      'writes the summary and stops under %o, without a directory',
      async (flags) => {
        using harness = createHarness({ isStdinTty: false });

        const { exitCode, stderr } = await harness.run(flags);

        expect(exitCode).toBe(0);
        expect(stderr).toContain('  Mode: dry run\n');
        expect(stderr).toMatch(/thor-npm publish-placeholder: nothing was published \(dry run\)\n$/);
        expect(harness.events).toStrictEqual(['whoami', `view ${NAME}`]);
        expect(harness.createdDirs).toStrictEqual([]);
      },
    );

    it.each([['n'], [''], [undefined]])('exits 1 without publishing when the answer is %o', async (answer) => {
      using harness = createHarness({ answer });

      const { exitCode, stderr } = await harness.run();

      expect(exitCode).toBe(1);
      expect(harness.events).toStrictEqual(['whoami', `view ${NAME}`, `ask ${QUESTION}`]);
      expect(stderr).toMatch(/thor-npm publish-placeholder: nothing was published\n$/);
      expect(harness.createdDirs).toStrictEqual([]);
    });
  });

  describe('given a failed check', () => {
    it('exits 2 for a non-terminal stdin without --force or --dry-run, before calling npm', async () => {
      using harness = createHarness({ isStdinTty: false });

      const { exitCode, stderr } = await harness.run();

      expect(exitCode).toBe(2);
      expect(stderr).toContain('needs a terminal on stdin; pass --force');
      expect(harness.events).toStrictEqual([]);
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
        case: 'the npm session check fails',
        npm: { whoami: { kind: 'failed', detail: 'request to https://registry.npmjs.org/-/whoami failed' } },
        exitCode: 1,
        message: 'could not check the npm session: request to https://registry.npmjs.org/-/whoami failed',
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
    ] as const)('exits $exitCode when $case, without a summary or a directory', async ({ exitCode, message, npm }) => {
      using harness = createHarness({ answer: 'y', npm });

      const result = await harness.run();

      expect(result.exitCode).toBe(exitCode);
      expect(result.stderr).toBe(`thor-npm publish-placeholder: ${message}\n`);
      expect(harness.events).not.toContain('publish');
      expect(harness.createdDirs).toStrictEqual([]);
    });

    it('reports a failed publish and removes the directory', async () => {
      using harness = createHarness({ answer: 'y', npm: { publish: { kind: 'failed', detail: 'exit 1' } } });

      const { exitCode, stderr } = await harness.run();

      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/thor-npm publish-placeholder: npm publish failed \(exit 1\); nothing was published\n$/);
      expect(harness.leftoverDirs()).toStrictEqual([]);
    });
  });
});

// region | Helpers

interface Harness extends Disposable {
  readonly createdDirs: string[];
  /** The npm calls and the questions asked, in the order in which they happened. */
  readonly events: string[];
  /** Lists the directories that `createTempDir` made and that still exist. */
  readonly leftoverDirs: () => string[];
  readonly run: (flags?: readonly string[]) => Promise<{ exitCode: number; stderr: string }>;
  /** The stderr text written before the question, or an empty string when nothing was asked. */
  readonly stderrBeforeQuestion: string;
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
  const events: string[] = [];
  const stderr = createTextBuffer();
  let stderrBeforeQuestion = '';

  const npm = createNpmStub({
    findVersion: (name) => {
      events.push(`view ${name}`);
      return settings.npm?.findVersion ?? { kind: 'absent' };
    },
    publish: () => {
      events.push('publish');
      return settings.npm?.publish ?? { kind: 'published' };
    },
    whoami: () => {
      events.push('whoami');
      return settings.npm?.whoami ?? { kind: 'logged-in', username: 'someone' };
    },
  });

  return {
    createdDirs,
    events,
    leftoverDirs: () => createdDirs.filter((dir) => fs.existsSync(dir)),
    async run(flags = []) {
      const exitCode = await run(
        ['publish-placeholder', NAME, ...flags],
        {
          createTempDir: () => {
            const dir = fs.mkdtempSync(path.join(tree.resolve('tmp'), 'placeholder-'));
            createdDirs.push(dir);
            return dir;
          },
          cwd: () => tree.dir,
          isStdinTty: () => settings.isStdinTty ?? true,
          isStdoutTty: () => false,
          npm,
          readAnswer: (question) => {
            events.push(`ask ${question}`);
            stderrBeforeQuestion = stderr.text;
            return Promise.resolve(settings.answer);
          },
          resolveVersion: () => '0.0.0',
          stdoutColumns: () => undefined,
        },
        { stderr, stdout: createTextBuffer() },
      );

      return { exitCode, stderr: stderr.text };
    },
    get stderrBeforeQuestion() {
      return stderrBeforeQuestion;
    },
    [Symbol.dispose]() {
      tree[Symbol.dispose]();
    },
  };
}

// endregion | Helpers
