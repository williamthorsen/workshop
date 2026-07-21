/**
 * Detect JSON mode by scanning raw argv, before any flag parsing happens.
 *
 * Answering this without `parseArgs` is what lets a flag-parse failure still be reported
 * through the JSON error envelope. The scan matches the exact token `--json` and stops at
 * the `--` terminator, after which arguments are positional rather than flags.
 */
export function hasJsonFlag(argv: string[]): boolean {
  for (const arg of argv) {
    if (arg === '--') return false;
    if (arg === '--json') return true;
  }
  return false;
}
