/** Returns a kit filename built from a kit name, an optional infix, and an extension. */
export function buildKitFilename(kitName: string, infix: string | undefined, extension: string): string {
  if (infix !== undefined) {
    return `${kitName}.${infix}${extension}`;
  }
  return `${kitName}${extension}`;
}
