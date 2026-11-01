import net from 'node:net';

import { describe, expect, it } from 'vitest';

import { findFreePort } from '../find-free-port.ts';

describe(findFreePort, () => {
  it('resolves to a port that can then be bound', async () => {
    const port = await findFreePort('127.0.0.1');

    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    await new Promise((resolve) => server.close(resolve));

    expect(port).toBeGreaterThan(0);
  });
});
