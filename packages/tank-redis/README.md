<!-- readme-type: library -->

# @williamthorsen/tank-redis

A store adapter that keeps a [`@williamthorsen/tank`](https://github.com/williamthorsen/showroom/tree/main/packages/tank#readme) balance in Redis, so that every instance of a serverless site draws on the same balance.

<!-- section:release-notes --><!-- /section:release-notes -->

## Installation

```bash
pnpm add @williamthorsen/tank @williamthorsen/tank-redis
```

Node 24 or later is required.

## Usage

```ts
import { Redis } from '@upstash/redis';
import { createTank } from '@williamthorsen/tank';
import { createRedisStore } from '@williamthorsen/tank-redis';

const store = createRedisStore({ client: Redis.fromEnv() });
const tank = createTank({
  config: { capacity: 100, refillAmount: 1, refillIntervalMs: 60_000 },
  store,
  key: 'tank:site',
});
```

`Redis.fromEnv()` reads `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. The tank's own README describes `reserve`, `settle`, and the snapshot.

`createMemoryStore` from `@williamthorsen/tank` serves a single process. Use this adapter once a balance must be shared across processes or instances.

## The client

The store calls one method on its client:

```ts
interface RedisEvalClient {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}
```

`@upstash/redis` and other HTTP clients that follow its interface satisfy it as-is. A TCP client needs a one-line wrapper:

```ts
// node-redis (`redis`)
const store = createRedisStore({
  client: { eval: (script, keys, args) => client.eval(script, { keys, arguments: args }) },
});

// ioredis
const store = createRedisStore({
  client: { eval: (script, keys, args) => redis.eval(script, keys.length, ...keys, ...args) },
});
```

Both operations run as Lua scripts, so compare-and-set is atomic over a stateless HTTP client, over which a `WATCH` transaction does not work.

## Storage

Each tank key is a Redis hash with the fields `balance`, `updatedAt`, and `version`, an integer that every write increments. The adapter uses the tank's `key` as the Redis key, so a site that shares the database with other data chooses a key that does not collide with it.
