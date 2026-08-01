import type { Plan } from '../schemas/planSchema.ts';
import { buildMinimalSample } from './buildMinimalSample.ts';
import { buildRepresentativeSample } from './buildRepresentativeSample.ts';

/** One published sample and the file it is emitted to. */
export interface SampleDocument {
  readonly fileName: string;
  readonly plan: Plan;
}

/** Every published sample, in the order they are emitted. */
export function buildSampleDocuments(): ReadonlyArray<SampleDocument> {
  return [
    { fileName: 'minimal.json', plan: buildMinimalSample() },
    { fileName: 'representative.json', plan: buildRepresentativeSample() },
  ];
}

/**
 * One sample rendered as the JSON file it is published as.
 *
 * The writer script and the drift test share this, so a mismatch between what is committed and what the builders
 * produce cannot be an artifact of how each side formatted the document.
 */
export function renderSampleJson(plan: Plan): string {
  return `${JSON.stringify(plan, undefined, 2)}\n`;
}

export { buildMinimalSample } from './buildMinimalSample.ts';
export { buildRepresentativeSample } from './buildRepresentativeSample.ts';
