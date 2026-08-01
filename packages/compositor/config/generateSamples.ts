/** Generate `samples/*.json` from the sample plan builders. */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { buildSampleDocuments, renderSampleJson } from '../src/samples/index.ts';

const outDir = path.join(process.cwd(), 'samples');
mkdirSync(outDir, { recursive: true });

for (const { fileName, plan } of buildSampleDocuments()) {
  writeFileSync(path.join(outDir, fileName), renderSampleJson(plan));
}
