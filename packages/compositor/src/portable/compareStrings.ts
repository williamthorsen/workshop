/**
 * Orders two strings by UTF-16 code unit, which is what a consumer diffing two payloads reproduces.
 *
 * Not `localeCompare`, whose order depends on the locale data the runtime happens to ship.
 */
export function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
