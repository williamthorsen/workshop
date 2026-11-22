import { describe, expect, it } from 'vitest';

import { createRedisStore, type RedisEvalClient } from '../createRedisStore.ts';
import { compareAndSetScript, readScript } from '../scripts.ts';

const key = 'tank:site';

describe(createRedisStore, () => {
  describe('read', () => {
    it('runs the read script on the key', async () => {
      const { client, calls } = createFakeClient([null, null, null]);

      await createRedisStore({ client }).read(key);

      expect(calls).toStrictEqual([{ script: readScript, keys: [key], args: [] }]);
    });

    it('reads a key whose fields are all absent as undefined', async () => {
      const { client } = createFakeClient([null, null, null]);

      await expect(createRedisStore({ client }).read(key)).resolves.toBeUndefined();
    });

    it.each([
      ['strings', ['0.30000000000000004', '1767225600123', '2']],
      ['numbers', [0.300_000_000_000_000_04, 1_767_225_600_123, 2]],
    ])('decodes fields returned as %s', async (_label, reply) => {
      const { client } = createFakeClient(reply);

      await expect(createRedisStore({ client }).read(key)).resolves.toStrictEqual({
        value: { balance: 0.300_000_000_000_000_04, updatedAt: 1_767_225_600_123 },
        version: 2,
      });
    });

    it.each([
      ['a partial hash', ['10', null, '1']],
      ['a non-numeric field', ['ten', '1000', '1']],
      ['an empty field', ['', '1000', '1']],
      ['a reply of the wrong length', ['10', '1000']],
      ['a reply that is not an array', 'OK'],
    ])('rejects %s, naming the key', async (_label, reply) => {
      const { client } = createFakeClient(reply);

      await expect(createRedisStore({ client }).read(key)).rejects.toThrow(`"${key}"`);
    });
  });

  describe('compareAndSet', () => {
    it.each([
      ['an empty string for an undefined version', undefined, ''],
      ['a numeric version as a string', 3, '3'],
      ['a string version as-is', '3', '3'],
    ])('passes %s, then the state as strings', async (_label, expected, versionArg) => {
      const { client, calls } = createFakeClient(1);

      await createRedisStore({ client }).compareAndSet(key, expected, { balance: 0.1 + 0.2, updatedAt: 1000 });

      expect(calls).toStrictEqual([
        { script: compareAndSetScript, keys: [key], args: [versionArg, '0.30000000000000004', '1000'] },
      ]);
    });

    it.each([
      [1, true],
      ['1', true],
      [0, false],
      ['0', false],
    ])('reads a reply of %j as %s', async (reply, written) => {
      const { client } = createFakeClient(reply);

      await expect(
        createRedisStore({ client }).compareAndSet(key, undefined, { balance: 1, updatedAt: 1 }),
      ).resolves.toBe(written);
    });

    it('rejects any other reply, naming the key', async () => {
      const { client } = createFakeClient('OK');

      await expect(
        createRedisStore({ client }).compareAndSet(key, undefined, { balance: 1, updatedAt: 1 }),
      ).rejects.toThrow(`"${key}"`);
    });
  });
});

// region | Helpers
/** Creates a client that records each call and resolves every call to `reply`. */
function createFakeClient(reply: unknown) {
  const calls: Array<{ script: string; keys: string[]; args: string[] }> = [];
  const client: RedisEvalClient = {
    eval(script, keys, args) {
      calls.push({ script, keys, args });
      return Promise.resolve(reply);
    },
  };
  return { client, calls };
}
// endregion | Helpers
