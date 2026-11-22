// Every number crosses the script boundary as a string, and the scripts never convert the balance or the time to a Lua
// number: Lua's `tostring` keeps 14 significant digits, and Redis truncates a Lua number reply to an integer.

/** Returns the stored balance, update time, and version of `KEYS[1]`, each `nil` when the field is absent. */
export const readScript = `return redis.call('HMGET', KEYS[1], 'balance', 'updatedAt', 'version')`;

/**
 * Writes `ARGV[2]` and `ARGV[3]` as the balance and update time of `KEYS[1]` with the next version, when the stored
 * version equals `ARGV[1]`, or, when `ARGV[1]` is empty, when the key is absent; returns 1 on a write and 0 otherwise.
 */
export const compareAndSetScript = `
local version = redis.call('HGET', KEYS[1], 'version')
if ARGV[1] == '' then
  if redis.call('EXISTS', KEYS[1]) == 1 then
    return 0
  end
elseif version ~= ARGV[1] then
  return 0
end
local nextVersion = 1
if version then
  nextVersion = tonumber(version) + 1
end
redis.call('HSET', KEYS[1], 'balance', ARGV[2], 'updatedAt', ARGV[3], 'version', tostring(nextVersion))
return 1
`;
