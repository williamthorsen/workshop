/**
 * Preflight kit shown on the presentation deck's code slide and run by its preflight page. Run from the repo root:
 *
 *   rdy run preflight
 */
import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';

import { defineRdyKit } from 'readyup';

export default defineRdyKit({
  checklists: [
    {
      name: 'preflight',
      checks: [
        {
          name: 'Docker daemon is running',
          check: () => spawnSync('docker', ['info']).status === 0,
          fix: 'Start Docker, then run the checks again',
        },
        {
          name: 'API is listening on port 3000',
          severity: 'warn',
          check: async () => {
            const open = await portAccepts(3000);
            if (!open) return { ok: false, detail: 'Nothing is listening on port 3000' };
            return true;
          },
          fix: 'Start the API with pnpm dev before the smoke test',
        },
      ],
    },
  ],
});

// region | Helpers

/** Resolves whether a TCP connection to the port on localhost succeeds. */
function portAccepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

// endregion | Helpers
