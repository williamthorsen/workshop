/** Generate `schemas/*.json` from the zod schemas that define readyup's JSON payloads. */

import path from 'node:path';
import process from 'node:process';

import { writeSchemaFiles } from './buildSchemas.ts';

writeSchemaFiles(path.join(process.cwd(), 'schemas'));
