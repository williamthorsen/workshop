import { existsSync, readdirSync, readFileSync } from 'node:fs';

import { createTextBuffer } from '@williamthorsen/toolbelt.cli/candidate';
import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import { run, type RunEffects } from '../run.ts';
import { buildRunEffects, DRAWN_SEED } from '../test-utils/build-run-effects.ts';
import { createFakeWorker } from '../test-utils/create-fake-worker.ts';

const RUN_NAME = '20261124-123456Z';

describe('thor-image generate', () => {
  it('renders every style and seed in one worker run and writes the record beside the images', async () => {
    using tree = createTempTree({});
    const worker = createFakeWorker();

    const result = await runGenerate(
      tree,
      ['a lighthouse', '--style', 'oil', '--style', 'noir', '--seed', '1', '--seed', '2'],
      { runWorker: worker.runWorker },
    );

    const runDir = tree.resolve(`thor-image/${RUN_NAME}`);
    expect(result).toStrictEqual({
      exitCode: 0,
      stderr: [
        'thor-image generate: rendering 4 images with qwen-image-2.1-turbo (mflux 0.24.0)',
        'rendered oil, seed 1 (1/4)',
        'rendered oil, seed 2 (2/4)',
        'rendered noir, seed 1 (3/4)',
        'rendered noir, seed 2 (4/4)',
        '',
      ].join('\n'),
      stdout: `thor-image generate: wrote 4 images and run.json to ${runDir}\n`,
    });
    expect(worker.requests).toHaveLength(1);
    expect(readRecord(runDir)).toMatchObject({
      createdAt: '2026-11-24T12:34:56.789Z',
      dryRun: false,
      failure: null,
      modelId: 'qwen-image-2.1-turbo',
      runDir,
      subject: 'a lighthouse',
    });
    expect(readRecord(runDir).images[0]).toStrictEqual({
      file: 'oil-1.png',
      licence: { name: 'Qwen Research License', url: 'https://huggingface.co/Qwen/Qwen-Image-2.1-Turbo' },
      mfluxVersion: '0.24.0',
      model: 'Qwen/Qwen-Image-2.1-Turbo',
      negativePrompt: expect.any(String),
      prompt: expect.stringContaining('a lighthouse'),
      seed: 1,
      settings: { height: 1024, references: [], steps: 8, variant: 'txt2img', width: 1024 },
      style: 'oil',
    });
  });

  it('draws one seed when none is given', async () => {
    using tree = createTempTree({});
    const worker = createFakeWorker();

    await runGenerate(tree, ['a fox', '--style', 'noir'], { runWorker: worker.runWorker });

    expect(worker.requests[0]?.jobs.map(({ seed }) => seed)).toStrictEqual([DRAWN_SEED]);
  });

  it('prints only the record under --json', async () => {
    using tree = createTempTree({});

    const { exitCode, stdout } = await runGenerate(tree, ['a fox', '--style', 'noir', '--seed', '3', '--json'], {
      runWorker: createFakeWorker().runWorker,
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toStrictEqual(readRecord(tree.resolve(`thor-image/${RUN_NAME}`)));
  });

  it('resolves a relative --output-dir and --reference against the working directory', async () => {
    using tree = createTempTree({ 'in/scene.png': 'png' });
    const worker = createFakeWorker();

    await runGenerate(tree, ['a fox', '-s', 'oil', '-r', 'in/scene.png', '-o', 'out', '--seed', '5'], {
      runWorker: worker.runWorker,
    });

    expect(worker.requests[0]).toMatchObject({
      jobs: [{ height: null, output: tree.resolve(`out/${RUN_NAME}/oil-5.png`), width: null }],
      references: [tree.resolve('in/scene.png')],
      variant: 'edit',
    });
  });

  it('suffixes the run directory when a run of the same second exists', async () => {
    using tree = createTempTree({ [`thor-image/${RUN_NAME}/oil-1.png`]: 'png' });
    const worker = createFakeWorker();

    await runGenerate(tree, ['a fox', '--style', 'oil', '--seed', '1'], { runWorker: worker.runWorker });

    expect(worker.requests[0]?.jobs[0]?.output).toBe(tree.resolve(`thor-image/${RUN_NAME}-2/oil-1.png`));
    expect(existsSync(tree.resolve(`thor-image/${RUN_NAME}-2/run.json`))).toBe(true);
  });

  describe('under --dry-run', () => {
    it('prints each image and its prompts, and neither renders nor creates anything', async () => {
      using tree = createTempTree({});

      const { exitCode, stdout } = await runGenerate(tree, ['a fox', '--style', 'oil', '--seed', '1', '-n']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('oil, seed 1 -> oil-1.png\n  prompt: a Dutch Golden Age oil painting of a fox');
      expect(stdout).toContain(
        `thor-image generate: dry run; would render 1 images with qwen-image-2.1-turbo into ${tree.resolve(`thor-image/${RUN_NAME}`)}`,
      );
      expect(readdirSync(tree.resolve('.'))).toStrictEqual([]);
    });

    it('prints the planned record under --json', async () => {
      using tree = createTempTree({});

      const { stdout } = await runGenerate(tree, ['a fox', '--style', 'oil', '--seed', '1', '--dry-run', '--json']);

      expect(JSON.parse(stdout)).toMatchObject({
        dryRun: true,
        images: [{ file: 'oil-1.png', mfluxVersion: '0.24.0', settings: { height: 1024, steps: null, width: 1024 } }],
      });
    });

    it('runs on a machine that cannot render', async () => {
      using tree = createTempTree({});

      const { exitCode } = await runGenerate(tree, ['a fox', '--style', 'oil', '-n'], {
        arch: 'x64',
        platform: 'linux',
      });

      expect(exitCode).toBe(0);
    });
  });

  describe('given a bad invocation', () => {
    it.each([
      { args: ['--style', 'oil'], expected: 'subject' },
      { args: ['a fox'], expected: 'thor-image: --style is required; name one or more styles, or all' },
      { args: ['a fox', '--style', 'oyl'], expected: "Did you mean 'oil'?" },
      { args: ['a fox', '--style', 'oil', '--seed', '1.5'], expected: 'a seed is an integer from 0 to 4294967295' },
      { args: ['a fox', '--style', 'oil', '--size', '1000x1000'], expected: 'positive multiples of 32' },
      { args: ['a fox', '--style', 'oil', '--model', 'sdxl'], expected: 'qwen-image-2.1-turbo' },
      {
        args: ['a fox', '--style', 'oil', '--model', 'z-image-turbo', '--reference', 'absent.png'],
        expected: 'z-image-turbo has no edit variant',
      },
      { args: ['a fox', '--style', 'oil', '--reference', 'absent.png'], expected: 'absent.png: file not found' },
    ])('exits 2 and writes nothing: $args', async ({ args, expected }) => {
      using tree = createTempTree({});

      const { exitCode, stderr, stdout } = await runGenerate(tree, args);

      expect(exitCode).toBe(2);
      expect(stdout).toBe('');
      expect(stderr).toContain(expected);
      expect(stderr).toContain("Try 'thor-image generate --help'.");
      expect(readdirSync(tree.resolve('.'))).toStrictEqual([]);
    });
  });

  describe('when rendering cannot run or fails', () => {
    it('refuses to render on a machine other than Apple Silicon', async () => {
      using tree = createTempTree({});

      const { exitCode, stderr } = await runGenerate(tree, ['a fox', '--style', 'oil'], {
        arch: 'x64',
        platform: 'linux',
      });

      expect(exitCode).toBe(1);
      expect(stderr).toBe('thor-image: mflux renders on Apple Silicon (darwin on arm64) only, not linux on x64\n');
    });

    it('exits 127 when uv is not on PATH', async () => {
      using tree = createTempTree({});

      const { exitCode, stderr } = await runGenerate(tree, ['a fox', '--style', 'oil'], {
        runWorker: createFakeWorker({ outcome: { ok: false, kind: 'missing-uv' } }).runWorker,
      });

      expect(exitCode).toBe(127);
      expect(stderr).toContain('uv is not on PATH; install it with brew install uv');
    });

    it('records the images that completed and the job that failed', async () => {
      using tree = createTempTree({});

      const { exitCode, stderr } = await runGenerate(
        tree,
        ['a fox', '--style', 'oil', '--style', 'noir', '--seed', '1'],
        { runWorker: createFakeWorker({ failAt: 1 }).runWorker },
      );

      const runDir = tree.resolve(`thor-image/${RUN_NAME}`);
      expect(exitCode).toBe(1);
      expect(stderr).toContain(
        `thor-image: image 2 failed: out of memory; wrote 1 of 2 images and run.json to ${runDir}`,
      );
      expect(readRecord(runDir)).toMatchObject({
        failure: { message: 'image 2 failed: out of memory', seed: 1, style: 'noir' },
        images: [{ file: 'oil-1.png' }],
      });
    });
  });

  it('lists the catalogue styles and the requirements in its help', async () => {
    using tree = createTempTree({});

    const { exitCode, stdout } = await runGenerate(tree, ['--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/Styles:\n {2}oil engraving manuscript/);
    expect(stdout).toContain('rubberhose');
    expect(stdout).toContain('Apple Silicon and uv');
    expect(stdout).toContain('--reference');
    expect(stdout).toContain('Examples:');
  });

  it('reports an invalid catalogue and exits 1', async () => {
    const stdout = createTextBuffer();
    const stderr = createTextBuffer();

    const exitCode = await run(
      ['generate', 'a fox', '--style', 'oil'],
      buildRunEffects({
        readCatalogue: () => ({ ok: false, problems: ['styles.yaml: entry 1: name must be a kebab-case string'] }),
      }),
      { stderr, stdout },
    );

    expect(exitCode).toBe(1);
    expect(stderr.text).toBe(
      'thor-image: the style catalogue is invalid:\n  styles.yaml: entry 1: name must be a kebab-case string\n',
    );
  });
});

// region | Helpers

/** Reads the record that a run wrote into `runDir`. */
function readRecord(runDir: string): { images: unknown[] } & Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(`${runDir}/run.json`, 'utf8'));
  if (typeof value !== 'object' || value === null || !('images' in value) || !Array.isArray(value.images)) {
    throw new Error(`${runDir}/run.json is not a run record.`);
  }
  return { ...value, images: value.images };
}

/** Runs `thor-image generate` with `args` in `tree`, collecting what it writes to each stream. */
async function runGenerate(
  tree: TempTree,
  args: string[],
  overrides: Partial<RunEffects> = {},
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const stdout = createTextBuffer();
  const stderr = createTextBuffer();
  const exitCode = await run(['generate', ...args], buildRunEffects({ cwd: tree.resolve('.'), ...overrides }), {
    stderr,
    stdout,
  });
  return { exitCode, stderr: stderr.text, stdout: stdout.text };
}

// endregion | Helpers
