import { mkdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createDemoRepo } from '../test-utils/create-demo-repo.ts';
import { runThorDemo } from '../test-utils/run-thor-demo.ts';

describe('thor-demo on an unanticipated throw', () => {
  it('reports an internal error with its stack frames and exits 1', () => {
    using repo = createDemoRepo();
    // A `.env` directory makes reading it throw EISDIR, which stands for any error that thor-demo does not handle.
    mkdirSync(repo.tree.resolve('.env'));

    const { status, stderr } = runThorDemo(['mcp'], repo.tree.dir);

    expect(status).toBe(1);
    expect(stderr).toMatch(/^thor-demo: internal error: .*EISDIR.*\n\s+at /m);
    expect(repo.readCalls()).toStrictEqual([]);
  });
});
