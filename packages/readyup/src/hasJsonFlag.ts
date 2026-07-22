/**
 * Detects JSON mode by scanning raw argv, before any flag parsing happens.
 *
 * Answering this without `parseArgs` is what lets a flag-parse failure still be reported through the JSON error
 * envelope. The scan matches only `--json`, and stops at the `--` terminator, after which arguments are positional
 * rather than flags.
 *
 * The scan over-detects in one case a parser would resolve differently: `--file --json` gives `--file` the literal
 * value `--json`. That is deliberate. This answer is consulted only when rendering a failure, never on the success
 * path where parsed values govern, so over-detection sends an error to the wrong channel while under-detection
 * leaves it unreportable in JSON at all.
 */
export function hasJsonFlag(argv: string[]): boolean {
  for (const arg of argv) {
    if (arg === '--') return false;
    if (arg === '--json') return true;
  }
  return false;
}
