/**
 * Returns the line beneath a package's heading in a rendered listing, which is where its command sits.
 *
 * Reading that line positionally is the assertion: a command fused into the heading would still satisfy a
 * `toContain` over the whole output. The heading rule anchors the search, since an unconfigured package's
 * heading has a trailing detail and a kit line could otherwise hold the same text.
 */
export function findPackageCommand(output: string, label: string): string | undefined {
  const lines = output.split('\n');
  const headingIndex = lines.findIndex((line) => line.startsWith('\u{2501}\u{2501} ') && line.includes(` ${label}`));
  return headingIndex === -1 ? undefined : lines[headingIndex + 1];
}
