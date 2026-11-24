import path from 'node:path';

import type { RenderJob, WorkerRequest } from '../jobs/build-jobs.ts';
import type { ImageModel } from '../models/models.ts';
import type { RenderedEvent } from '../worker/parse-worker-event.ts';

/** One image of a run, with everything needed to reproduce it. */
export interface ImageRecord {
  /** The image's file name inside the run directory. */
  readonly file: string;
  readonly licence: { readonly name: string; readonly url: string };
  readonly mfluxVersion: string;
  /** The Hugging Face repository of the model that rendered the image. */
  readonly model: string;
  readonly negativePrompt: string | null;
  /** The full prompt, the style's template with the subject in place. */
  readonly prompt: string;
  readonly seed: number;
  readonly settings: {
    /** Pixels; `null` in a dry run when the edit variant would derive it from the last reference. */
    readonly height: number | null;
    readonly references: readonly string[];
    /** The denoising steps that mflux applied; `null` in a dry run, which leaves them to the model's default. */
    readonly steps: number | null;
    readonly variant: WorkerRequest['variant'];
    readonly width: number | null;
  };
  readonly style: string;
}

/** The record of one `generate` run, which `run.json` contains and `--json` prints. */
export interface RunRecord {
  /** When the run started, in ISO 8601. */
  readonly createdAt: string;
  /** Whether the record describes a run that `--dry-run` planned rather than rendered. */
  readonly dryRun: boolean;
  /** The job that failed, or `null` when none did. */
  readonly failure: { readonly message: string; readonly seed: number; readonly style: string } | null;
  /** The images that the run rendered, or in a dry run would render, in job order. */
  readonly images: readonly ImageRecord[];
  /** The `--model` id. */
  readonly modelId: string;
  readonly runDir: string;
  readonly subject: string;
}

/** What a run produced, from which `buildRunRecord` states its record. */
export interface RunOutcome {
  /** The job that failed and why. */
  readonly failure: { readonly index: number; readonly message: string } | undefined;
  /** The mflux release that the worker reported, or the pinned one for a dry run. */
  readonly mfluxVersion: string;
  /** The worker's events for the jobs that it rendered; `undefined` for a dry run. */
  readonly rendered: readonly RenderedEvent[] | undefined;
}

/** Builds the record of a run of `request` with `model`, started at `createdAt`, from what the run produced. */
export function buildRunRecord(input: {
  createdAt: Date;
  model: ImageModel;
  outcome: RunOutcome;
  request: WorkerRequest;
  runDir: string;
  subject: string;
}): RunRecord {
  const { createdAt, model, outcome, request, runDir, subject } = input;
  const failedJob = outcome.failure === undefined ? undefined : request.jobs[outcome.failure.index];
  const images =
    outcome.rendered === undefined
      ? request.jobs.map((job) => recordImage(job, undefined, model, outcome.mfluxVersion, request))
      : outcome.rendered.flatMap((event) => {
          const job = request.jobs[event.index];
          return job === undefined ? [] : [recordImage(job, event, model, outcome.mfluxVersion, request)];
        });
  return {
    createdAt: createdAt.toISOString(),
    dryRun: outcome.rendered === undefined,
    failure:
      outcome.failure === undefined || failedJob === undefined
        ? null
        : { message: outcome.failure.message, seed: failedJob.seed, style: failedJob.style },
    images,
    modelId: model.id,
    runDir,
    subject,
  };
}

// region | Helpers

/** States one image from its job and, unless the run is dry, the worker's report of what it rendered. */
function recordImage(
  job: RenderJob,
  event: RenderedEvent | undefined,
  model: ImageModel,
  mfluxVersion: string,
  request: WorkerRequest,
): ImageRecord {
  return {
    file: path.basename(job.output),
    licence: model.licence,
    mfluxVersion,
    model: model.modelName,
    negativePrompt: job.negativePrompt,
    prompt: job.prompt,
    seed: job.seed,
    settings: {
      height: event?.height ?? job.height,
      references: request.references,
      steps: event?.steps ?? null,
      variant: request.variant,
      width: event?.width ?? job.width,
    },
    style: job.style,
  };
}

// endregion | Helpers
