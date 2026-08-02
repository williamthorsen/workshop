/** Orders two strings by code point, which is what a consumer diffing two payloads reproduces. */
export function compareStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
