import net from 'node:net';

/** Resolves to a port on `host` that was free when checked, by binding port 0 and releasing what the system chose. */
export async function findFreePort(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error(`cannot read the port bound on ${host}`));
        return;
      }
      server.close(() => {
        resolve(address.port);
      });
    });
  });
}
