import net from 'node:net';

/** Returns a loopback port that the system just assigned and released, on which nothing listens. */
export async function takeClosedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the listener has no TCP port');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}
