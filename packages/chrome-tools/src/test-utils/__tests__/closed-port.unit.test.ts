import net from 'node:net';

import { describe, expect, it } from 'vitest';

import { takeClosedPort } from '../closed-port.ts';

describe(takeClosedPort, () => {
  it('returns a loopback port that refuses a connection', async () => {
    const port = await takeClosedPort();
    const error = await new Promise<unknown>((resolve) => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolve(undefined);
      });
      socket.once('error', resolve);
    });
    expect(error).toMatchObject({ code: 'ECONNREFUSED' });
  });
});
