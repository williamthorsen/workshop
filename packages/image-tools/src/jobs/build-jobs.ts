import path from 'node:path';

import { fillTemplate } from '../catalogue/fill-template.ts';
import { ALL_STYLES, type Style } from '../catalogue/read-catalogue.ts';
import type { ImageModel } from '../models/models.ts';
import { findNearestName } from '../portable/find-nearest-name.ts';
import type { Size } from './parse-flag-values.ts';

/** What `generate` was asked to render, with paths already absolute. */
export interface GenerateRequest {
  readonly model: ImageModel;
  /** Absolute paths of the reference images, which route every job to the model's edit variant. */
  readonly references: readonly string[];
  /** The directory into which the run writes its images. */
  readonly runDir: string;
  readonly seeds: readonly number[];
  /** The requested size, or `undefined` for the default. */
  readonly size: Size | undefined;
  /** Style names as given, or `all`. */
  readonly styleNames: readonly string[];
  readonly subject: string;
}

/** One image for the worker to render. */
export interface RenderJob {
  readonly height: number | null;
  readonly negativePrompt: string | null;
  /** The absolute path of the PNG to write. */
  readonly output: string;
  readonly prompt: string;
  readonly seed: number;
  readonly style: string;
  /** `null`, with `height`, when the edit variant derives the size from the last reference. */
  readonly width: number | null;
}

/** The document that the worker reads on stdin: one model variant and the jobs that it renders. */
export interface WorkerRequest {
  readonly jobs: readonly RenderJob[];
  /** The `--model` id of the model to load. */
  readonly model: string;
  readonly references: readonly string[];
  readonly variant: 'edit' | 'txt2img';
}

/** The outcome of building jobs: the worker's request, or a usage problem with the nearest valid name. */
export type BuildJobsResult =
  { ok: true; request: WorkerRequest } | { ok: false; problem: string; suggestion?: string | undefined };

/** The size of an image rendered from text alone when `--size` is absent. */
export const DEFAULT_SIZE: Size = { height: 1024, width: 1024 };

/**
 * Validates `request` against the catalogue's `styles` and the model, and returns one job per distinct style and
 * seed, style-major in the order given (catalogue order for `all`). `isFile` reports whether a reference exists.
 */
export function buildJobs(
  request: GenerateRequest,
  styles: readonly Style[],
  isFile: (filePath: string) => boolean,
): BuildJobsResult {
  const { model, references, runDir, size, subject } = request;
  if (subject.trim() === '') return { ok: false, problem: 'the subject is empty; describe what to render' };

  const selected = selectStyles(request.styleNames, styles);
  if (!selected.ok) return selected;

  if (references.length > 0 && model.maxReferences === 0) {
    return {
      ok: false,
      problem: `${model.id} has no edit variant, so it takes no --reference; use --model qwen-image-2.1-turbo`,
    };
  }
  if (references.length > model.maxReferences) {
    return {
      ok: false,
      problem: `${model.id} takes at most ${model.maxReferences} references, not ${references.length}`,
    };
  }
  const missing = references.find((reference) => !isFile(reference));
  if (missing !== undefined) return { ok: false, problem: `--reference ${missing}: file not found` };

  const { height, width } = size ?? (references.length > 0 ? { height: null, width: null } : DEFAULT_SIZE);
  const seeds = [...new Set(request.seeds)];
  const jobs = selected.styles.flatMap((style) => {
    const { negativePrompt, prompt } = fillTemplate(style, subject);
    return seeds.map((seed) => ({
      height,
      negativePrompt: negativePrompt ?? null,
      output: path.join(runDir, `${style.name}-${seed}.png`),
      prompt,
      seed,
      style: style.name,
      width,
    }));
  });
  return {
    ok: true,
    request: { jobs, model: model.id, references, variant: references.length > 0 ? 'edit' : 'txt2img' },
  };
}

// region | Helpers

/** Resolves style names, or `all` alone, to catalogue styles, without repeats. */
function selectStyles(
  names: readonly string[],
  styles: readonly Style[],
): { ok: true; styles: readonly Style[] } | { ok: false; problem: string; suggestion?: string | undefined } {
  if (names.length === 0) {
    return { ok: false, problem: `--style is required; name one or more styles, or ${ALL_STYLES}` };
  }
  if (names.includes(ALL_STYLES)) {
    return names.every((name) => name === ALL_STYLES)
      ? { ok: true, styles }
      : { ok: false, problem: `--style ${ALL_STYLES} selects every style and cannot be combined with a style name` };
  }

  const byName = new Map(styles.map((style) => [style.name, style]));
  const selected: Style[] = [];
  const uniqueNames = new Set(names);
  for (const name of uniqueNames) {
    const style = byName.get(name);
    if (style === undefined) {
      const known = byName.keys().toArray();
      return {
        ok: false,
        problem: `--style accepts ${new Intl.ListFormat('en', { type: 'disjunction' }).format([...known, ALL_STYLES])}, not ${name}`,
        suggestion: findNearestName(name, known),
      };
    }
    selected.push(style);
  }
  return { ok: true, styles: selected };
}

// endregion | Helpers
