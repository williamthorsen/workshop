import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildSampleDocuments, renderSampleJson } from '../sample-documents.ts';

const samplesDir = path.join(import.meta.dirname, '..', '..', '..', 'samples');

const documents = buildSampleDocuments().map((document) => [document.fileName, document] as const);

describe('committed samples', () => {
  it.each(documents)('%s matches what the builders produce', (fileName, { plan }) => {
    expect(readFileSync(path.join(samplesDir, fileName), 'utf8')).toStrictEqual(renderSampleJson(plan));
  });
});
