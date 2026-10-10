import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { createTempTree, type TempTree } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

const BUILD_ENTRY = 'dist/esm/bin/thor-node.js';

const WRAPPER_ENTRY = 'bin/thor-node.js';

const WRAPPER_SOURCE = fs.readFileSync(path.join(import.meta.dirname, '../../../', WRAPPER_ENTRY), 'utf8');

describe('thor-node wrapper', () => {
  it('reports the absent build and names the command that produces it', () => {
    using tree = createTempTree({ [WRAPPER_ENTRY]: WRAPPER_SOURCE });

    const { status, stderr } = runWrapper(tree);

    expect(status).toBe(1);
    expect(stderr).toMatch(/build output not found/);
    expect(stderr).toMatch(/nmr build/);
  });

  it('reports a load failure when the build is present and one of its imports is not', () => {
    using tree = createTempTree({
      [WRAPPER_ENTRY]: WRAPPER_SOURCE,
      [BUILD_ENTRY]: "import './absent.js';\n",
    });

    const { status, stderr } = runWrapper(tree);

    expect(status).toBe(1);
    expect(stderr).toMatch(/failed to load/);
    // The absence is the assertion: The gate reads the entry file, whereas the error code that it would otherwise
    // key on fires for any unresolved module in the graph.
    expect(stderr).not.toMatch(/build output not found/);
  });
});

// region | Helpers

/** Runs the wrapper written into a tree, returning what the process wrote to stderr and exited with. */
function runWrapper(tree: TempTree): { status: number | null; stderr: string } {
  const { status, stderr } = spawnSync(process.execPath, [tree.resolve(WRAPPER_ENTRY)], { encoding: 'utf8' });

  return { status, stderr };
}

// endregion | Helpers
