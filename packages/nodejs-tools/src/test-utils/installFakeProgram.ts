import fs from 'node:fs';

import type { TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { vi } from 'vitest';

/** Writes an executable shell script of the given name and body into the tree and puts its directory alone on PATH. */
export function installFakeProgram(tree: TempTree, name: string, body: string): void {
  const scriptPath = tree.write(`bin/${name}`, `#!/bin/sh\n${body}`);
  fs.chmodSync(scriptPath, 0o755);
  vi.stubEnv('PATH', tree.resolve('bin'));
}
