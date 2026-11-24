import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { serializeReadout } from '@williamthorsen/readout';
import { CliError, type Command, createCli, UsageError, type Writer } from '@williamthorsen/toolbelt.cli/candidate';

import { ALL_STYLES, type Style } from '../catalogue/read-catalogue.ts';
import { buildJobs, type WorkerRequest } from '../jobs/build-jobs.ts';
import { parseSeed, parseSize, type Size } from '../jobs/parse-flag-values.ts';
import { DEFAULT_MODEL_ID, type ImageModel, MODEL_IDS, MODELS } from '../models/models.ts';
import { buildRunRecord, type RunRecord } from '../record/build-run-record.ts';
import { MFLUX_VERSION } from '../worker/run-worker.ts';
import type { RunEffects } from './run.ts';

/** The directory under the working directory into which runs go when `--output-dir` is absent. */
export const DEFAULT_OUTPUT_DIR = 'thor-image';

/** The exit code of a run that could not find `uv`, the external command that runs the worker. */
export const EXIT_MISSING_COMMAND = 127;

/** The name of the record that each run writes beside its images. */
export const RECORD_FILE = 'run.json';

const { defineCommand } = createCli<RunEffects>();

/** Defines the `generate` command, whose help lists `styles`, the catalogue's style names. */
export function defineGenerateCommand(styles: readonly Style[]): Command<RunEffects> {
  return defineCommand({
    summary: 'Render a subject in one or more named styles',
    description: `Fill each style's prompt with the subject and render every style and seed with one model, loaded once. Write each image to <output-dir>/<timestamp>/<style>-<seed>.png, and run.json beside them, which states per image the model, its licence, the mflux version, the full prompt, the seed, and the settings. Reference images route the run to the model's edit variant. Rendering requires Apple Silicon and uv, which runs mflux ${MFLUX_VERSION}; the first run of a model downloads its weights from Hugging Face.`,
    operands: [{ name: 'subject', description: 'What to render, such as "a lighthouse in a storm"' }],
    flags: {
      dryRun: {
        type: 'boolean',
        short: 'n',
        description: 'Print the images and prompts that the run would render, and render nothing',
      },
      json: { type: 'boolean', description: 'Print the run record as JSON on stdout' },
      model: {
        type: 'string',
        short: 'm',
        description: `The model to render with: ${MODEL_IDS.join(' or ')}`,
        valueHint: 'id',
        choices: MODEL_IDS,
        default: DEFAULT_MODEL_ID,
      },
      outputDir: {
        type: 'path',
        short: 'o',
        description: `The directory in which each run creates its own. Default: ./${DEFAULT_OUTPUT_DIR}`,
        valueHint: 'dir',
      },
      reference: {
        type: 'path',
        short: 'r',
        multiple: true,
        description: 'A reference image to edit from; requires a model with an edit variant',
        valueHint: 'image',
      },
      seed: {
        type: 'string',
        multiple: true,
        description: 'A seed to render each style with. Default: one random seed',
        valueHint: 'n',
        parse: parseSeed,
      },
      size: {
        type: 'string',
        description: 'The image size, in multiples of 32. Default: 1024x1024, or from the last reference',
        valueHint: 'WIDTHxHEIGHT',
        parse: parseSize,
      },
      style: {
        type: 'string',
        short: 's',
        multiple: true,
        description: `A style to render, or ${ALL_STYLES} for every style. Required`,
        valueHint: 'name',
      },
    },
    epilog: `Styles:\n${formatStyleList(styles)}`,
    examples: [
      {
        description: 'Render a subject in two styles',
        command: '{invocation} "a lighthouse in a storm" --style oil --style engraving',
      },
      {
        description: 'Render every style with two seeds',
        command: '{invocation} "a fox in the snow" --style all --seed 1 --seed 2',
      },
      {
        description: 'Restyle an existing picture',
        command: '{invocation} "the same scene" --style watercolor --reference ./scene.png',
      },
    ],
    run: ({ context, flags, operands, stderr, stdout }) =>
      runGenerate(
        context,
        styles,
        {
          isDryRun: flags.dryRun,
          isJson: flags.json,
          modelId: flags.model,
          outputDir: flags.outputDir,
          references: flags.reference,
          seeds: flags.seed,
          size: flags.size,
          styleNames: flags.style,
          subject: operands.subject,
        },
        { stderr, stdout },
      ),
  });
}

// region | Helpers

/** Creates the run directory under `parent`, suffixing `-2`, `-3`, and so on when the name is taken. */
function createRunDir(parent: string, name: string): string {
  mkdirSync(parent, { recursive: true });
  for (let attempt = 1; ; attempt++) {
    const candidate = path.join(parent, attempt === 1 ? name : `${name}-${attempt}`);
    try {
      mkdirSync(candidate);
      return candidate;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    }
  }
}

/** Renders the dry run's plan for a person: each image with its prompts, then the run that it describes. */
function formatDryRun(record: RunRecord): string {
  const images = record.images.map((image) => {
    const negative = image.negativePrompt === null ? '' : `\n  negative prompt: ${image.negativePrompt}`;
    return `${image.style}, seed ${image.seed} -> ${image.file}\n  prompt: ${image.prompt}${negative}\n`;
  });
  return `${images.join('')}thor-image generate: dry run; would render ${record.images.length} images with ${record.modelId} into ${record.runDir}\n`;
}

/** Formats a date as `YYYYMMDD-HHMMSSZ` in UTC. */
function formatRunName(date: Date): string {
  return date
    .toISOString()
    .replaceAll(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')
    .replace('T', '-');
}

/** Lists the style names for help, wrapped to the width of a help page. */
function formatStyleList(styles: readonly Style[]): string {
  const lines: string[] = [];
  let line = ' ';
  for (const { name } of styles) {
    if (line.length + name.length + 1 > 78) {
      lines.push(line);
      line = ' ';
    }
    line += ` ${name}`;
  }
  lines.push(line);
  return lines.join('\n');
}

/** What `generate` was invoked with, after parsing. */
interface GenerateOptions {
  readonly isDryRun: boolean;
  readonly isJson: boolean;
  readonly modelId: string;
  readonly outputDir: string | undefined;
  readonly references: readonly string[];
  readonly seeds: readonly number[];
  readonly size: Size | undefined;
  readonly styleNames: readonly string[];
  readonly subject: string;
}

/** Reports whether `filePath` names a regular file. */
function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/** Moves each job's output from the planned run directory to the one that was created. */
function relocateJobs(request: WorkerRequest, planned: string, actual: string): WorkerRequest {
  if (planned === actual) return request;
  return {
    ...request,
    jobs: request.jobs.map((job) => ({ ...job, output: path.join(actual, path.basename(job.output)) })),
  };
}

/** Returns the model with the `--model` id, which the flag's choices restrict to a known one. */
function requireModel(modelId: string): ImageModel {
  const model = MODELS.find(({ id }) => id === modelId);
  if (model === undefined) throw new Error(`The model registry lacks ${modelId}, which --model accepted.`);
  return model;
}

/** Runs `generate`: builds the jobs, renders them through the worker unless dry, and writes the record. */
async function runGenerate(
  effects: RunEffects,
  styles: readonly Style[],
  options: GenerateOptions,
  streams: { stderr: Writer; stdout: Writer },
): Promise<number> {
  const { stderr, stdout } = streams;
  const createdAt = effects.now();
  const model = requireModel(options.modelId);
  const parent = options.outputDir ?? path.join(effects.cwd, DEFAULT_OUTPUT_DIR);
  const runName = formatRunName(createdAt);
  const seeds = options.seeds.length > 0 ? options.seeds : [effects.drawSeed()];

  const built = buildJobs({ ...options, model, runDir: path.join(parent, runName), seeds }, styles, isFile);
  if (!built.ok) throw new UsageError(built.problem, { suggestion: built.suggestion });

  if (options.isDryRun) {
    const record = buildRunRecord({
      createdAt,
      model,
      outcome: { failure: undefined, mfluxVersion: MFLUX_VERSION, rendered: undefined },
      request: built.request,
      runDir: path.join(parent, runName),
      subject: options.subject,
    });
    stdout.write(options.isJson ? serializeRecord(record) : formatDryRun(record));
    return 0;
  }

  if (effects.platform !== 'darwin' || effects.arch !== 'arm64') {
    throw new CliError(
      `mflux renders on Apple Silicon (darwin on arm64) only, not ${effects.platform} on ${effects.arch}`,
    );
  }

  const runDir = createRunDir(parent, runName);
  const request = relocateJobs(built.request, path.join(parent, runName), runDir);
  const total = request.jobs.length;
  const outcome = await effects.runWorker(request, {
    env: effects.env,
    onEvent: (event) => {
      if (event.event === 'started') {
        stderr.write(`thor-image generate: rendering ${total} images with ${model.id} (mflux ${event.mfluxVersion})\n`);
      } else if (event.event === 'rendered') {
        const job = request.jobs[event.index];
        if (job !== undefined) stderr.write(`rendered ${job.style}, seed ${job.seed} (${event.index + 1}/${total})\n`);
      }
    },
  });

  if (!outcome.ok && outcome.kind === 'missing-uv') {
    throw new CliError('uv is not on PATH; install it with brew install uv, then run thor-image generate again', {
      exitCode: EXIT_MISSING_COMMAND,
    });
  }

  // The worker renders in job order, so the job after the last one rendered is the one that failed.
  const failure = outcome.ok ? undefined : { index: outcome.rendered.length, message: outcome.problem };
  const record = buildRunRecord({
    createdAt,
    model,
    outcome: {
      failure,
      mfluxVersion: outcome.mfluxVersion ?? MFLUX_VERSION,
      rendered: outcome.rendered,
    },
    request,
    runDir,
    subject: options.subject,
  });
  writeFileSync(path.join(runDir, RECORD_FILE), serializeRecord(record));

  if (!outcome.ok) {
    throw new CliError(
      `${outcome.problem}; wrote ${record.images.length} of ${total} images and ${RECORD_FILE} to ${runDir}`,
    );
  }
  stdout.write(
    options.isJson
      ? serializeRecord(record)
      : `thor-image generate: wrote ${total} images and ${RECORD_FILE} to ${runDir}\n`,
  );
  return 0;
}

/** Serializes the record as one JSON document ending in a newline. */
function serializeRecord(record: RunRecord): string {
  return `${serializeReadout({ data: record, sensitive: [] })}\n`;
}

// endregion | Helpers
