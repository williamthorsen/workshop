/** Build a kit filename from a kit name, optional infix, and extension. */
export function buildKitFilename(kitName: string, infix: string | undefined, extension: string): string {
  if (infix !== undefined) {
    return `${kitName}.${infix}${extension}`;
  }
  return `${kitName}${extension}`;
}
