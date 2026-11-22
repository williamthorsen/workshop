import { execFileSync } from 'node:child_process';

import { Redis } from '@upstash/redis';
import { describeStoreContract } from '@williamthorsen/tank/testing';
import { createClient } from 'redis';
import {
  GenericContainer,
  getContainerRuntimeClient,
  Network,
  type StartedNetwork,
  type StartedTestContainer,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRedisStore, type RedisEvalClient } from '../createRedisStore.ts';

const redisImage = 'redis:8.8.4-alpine';
const srhImage = 'hiett/serverless-redis-http:0.0.10';
const srhToken = 'tank-redis-test-token';
// The first run on a machine pulls both images, which the tier's 30-second hook budget does not cover.
const startupTimeoutMs = 120_000;

const isDockerAvailable = await probeDocker();
const isSkipped = !isDockerAvailable && process.env['CI'] === undefined;
if (isSkipped) {
  console.warn('Skipping the Redis suite of tank-redis: Docker is not reachable. Start Docker to run it.');
}

describe.skipIf(isSkipped)('createRedisStore against a real Redis', () => {
  let network: StartedNetwork | undefined;
  let redisContainer: StartedTestContainer | undefined;
  let srhContainer: StartedTestContainer | undefined;
  let tcpClient: NodeRedisClient | undefined;
  let httpClient: Redis | undefined;

  beforeAll(async () => {
    network = await new Network().start();
    redisContainer = await new GenericContainer(redisImage)
      .withNetwork(network)
      .withNetworkAliases('redis')
      .withExposedPorts(6379)
      .start();
    srhContainer = await new GenericContainer(srhImage)
      .withNetwork(network)
      .withEnvironment({ SRH_CONNECTION_STRING: 'redis://redis:6379', SRH_MODE: 'env', SRH_TOKEN: srhToken })
      .withExposedPorts(80)
      .start();

    tcpClient = createClient({ url: `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}` });
    await tcpClient.connect();
    httpClient = new Redis({
      url: `http://${srhContainer.getHost()}:${srhContainer.getMappedPort(80)}`,
      token: srhToken,
    });
  }, startupTimeoutMs);

  afterAll(async () => {
    await tcpClient?.close();
    await srhContainer?.stop();
    await redisContainer?.stop();
    await network?.stop();
  });

  const variants: Array<[string, () => RedisEvalClient]> = [
    ['over TCP through node-redis', () => wrapNodeRedis(requireValue(tcpClient))],
    ['over HTTP through @upstash/redis', () => requireValue(httpClient)],
  ];

  describe.each(variants)('%s', (label, getClient) => {
    // Both variants reach the same Redis, so each store starts from an emptied database.
    async function createEmptyStore() {
      await requireValue(tcpClient).flushDb();
      return createRedisStore({ client: getClient() });
    }

    // eslint-disable-next-line vitest/require-hook -- the call registers a suite that the rule does not detect.
    describeStoreContract(`createRedisStore ${label}`, createEmptyStore);

    it('round-trips a balance that needs all 17 significant digits', async () => {
      const store = await createEmptyStore();
      const state = { balance: 0.1 + 0.2, updatedAt: 1_767_225_600_123 };

      await expect(store.compareAndSet('round-trip', undefined, state)).resolves.toBe(true);

      await expect(store.read('round-trip')).resolves.toStrictEqual({ value: state, version: 1 });
    });
  });
});

type NodeRedisClient = ReturnType<typeof createClient>;

// region | Helpers
/**
 * Returns whether Testcontainers can reach a container runtime, first pointing `DOCKER_HOST` at the active Docker
 * context's endpoint when the variable is unset, because Testcontainers does not read Docker contexts.
 */
async function probeDocker(): Promise<boolean> {
  const contextHost = process.env['DOCKER_HOST'] === undefined ? readDockerContextHost() : undefined;
  if (contextHost !== undefined) {
    process.env['DOCKER_HOST'] = contextHost;
  }
  try {
    await getContainerRuntimeClient();
    return true;
  } catch {
    return false;
  }
}

/** Returns the endpoint of the active Docker context, or `undefined` when the `docker` CLI cannot report one. */
function readDockerContextHost(): string | undefined {
  try {
    const host = execFileSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return host === '' ? undefined : host;
  } catch {
    return undefined;
  }
}

/** Returns `value`, throwing when the suite's setup has not assigned it. */
function requireValue<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('The Redis suite used a client before its setup assigned it');
  }
  return value;
}

/** Adapts a node-redis client to the store's one-method client interface. */
function wrapNodeRedis(client: NodeRedisClient): RedisEvalClient {
  return { eval: (script, keys, args) => client.eval(script, { keys, arguments: args }) };
}
// endregion | Helpers
