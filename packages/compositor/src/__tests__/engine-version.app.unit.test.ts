import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ENGINE_VERSION } from '../engine-version.ts';

const manifestPath = path.join(import.meta.dirname, '..', '..', 'package.json');

describe('engine version', () => {
  it('matches the version the package manifest declares', async () => {
    const manifest = z.object({ version: z.string() }).parse(JSON.parse(await readFile(manifestPath, 'utf8')));

    expect(ENGINE_VERSION).toBe(manifest.version);
  });
});
