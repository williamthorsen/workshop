import fs from 'node:fs';
import path from 'node:path';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { onTestFinished } from 'vitest';

/**
 * Writes each stub as an executable `sh` script, named by its key and containing its value as the body, into a fixture
 * `bin/`, and returns a PATH that searches that directory ahead of `basePath`.
 */
export function makeStubPath(stubs: Record<string, string>, basePath = process.env['PATH'] ?? ''): string {
  const tree = createTempTree({}, { prefix: 'thor-chrome-' });
  onTestFinished(() => {
    tree[Symbol.dispose]();
  });
  const bin = tree.mkdir('bin');
  for (const [name, body] of Object.entries(stubs)) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  }
  return basePath === '' ? bin : `${bin}:${basePath}`;
}
