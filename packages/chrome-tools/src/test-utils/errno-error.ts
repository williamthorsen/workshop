/** Builds an error shaped as a Node system error with the given code, as `process.kill` throws. */
export function makeErrnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`kill ${code}`), { code, errno: -1, syscall: 'kill' });
}
