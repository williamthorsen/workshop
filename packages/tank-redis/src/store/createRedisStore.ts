import type { BalanceState, BalanceStore, Version, Versioned } from '@williamthorsen/tank';

import { compareAndSetScript, readScript } from './scripts.ts';

/**
 * Creates a `BalanceStore` that keeps each tank key as a Redis hash of `balance`, `updatedAt`, and an integer
 * `version`, and runs both operations as Lua scripts through `client`.
 */
export function createRedisStore(options: RedisStoreOptions): BalanceStore {
  const { client } = options;

  return {
    async read(key) {
      return decodeState(key, await client.eval(readScript, [key], []));
    },

    async compareAndSet(key, expected, next) {
      const reply = await client.eval(
        compareAndSetScript,
        [key],
        [encodeVersion(expected), String(next.balance), String(next.updatedAt)],
      );
      return decodeWritten(key, reply);
    },
  };
}

/**
 * The one client method that the store calls: runs `script` with `keys` as `KEYS` and `args` as `ARGV`, and resolves to
 * the script's reply. `@upstash/redis` satisfies it as-is; a TCP client satisfies it through a one-line wrapper.
 */
export interface RedisEvalClient {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

/** The options of `createRedisStore`. */
export interface RedisStoreOptions {
  client: RedisEvalClient;
}

// region | Helpers
/** Returns the finite number that `value` holds, as a string or a number; throws naming the key and the field. */
function decodeNumber(key: string, field: string, value: unknown): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    throw new TypeError(`Redis holds an invalid ${field} for tank key "${key}": ${String(value)}`);
  }
  return number;
}

/** Returns the stored state of `key`, or `undefined` when every field is absent; throws when the reply is malformed. */
function decodeState(key: string, reply: unknown): Versioned<BalanceState> | undefined {
  if (!Array.isArray(reply) || reply.length !== 3) {
    throw new Error(`Redis returned a malformed reply for tank key "${key}": expected three fields`);
  }
  const fields: unknown[] = reply;
  if (fields.every(isAbsent)) {
    return undefined;
  }
  const [balance, updatedAt, version] = fields;
  return {
    value: { balance: decodeNumber(key, 'balance', balance), updatedAt: decodeNumber(key, 'updatedAt', updatedAt) },
    version: decodeNumber(key, 'version', version),
  };
}

/** Returns whether the compare-and-set script wrote; throws when the reply is neither 1 nor 0. */
function decodeWritten(key: string, reply: unknown): boolean {
  if (reply === 1 || reply === '1') {
    return true;
  }
  if (reply === 0 || reply === '0') {
    return false;
  }
  throw new Error(`Redis returned a malformed compare-and-set reply for tank key "${key}": ${String(reply)}`);
}

/** Returns the script argument for `expected`, in which an empty string stands for "the key is absent". */
function encodeVersion(expected: Version | undefined): string {
  return expected === undefined ? '' : String(expected);
}

/** Returns whether a field of a reply is absent, which clients report as `null` or `undefined`. */
function isAbsent(value: unknown): boolean {
  return value === null || value === undefined;
}
// endregion | Helpers
