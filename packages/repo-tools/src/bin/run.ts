import process from 'node:process';

export const HELP = `thor-repo: act on the repositories indexed by a machine-local repo registry

Usage:
  thor-repo [--help]

Subcommands are not implemented yet.

Options:
  -h, --help Show this help.

Exit codes:
  0  Help shown.
  2  Invalid arguments.
`;

/**
 * Runs the thor-repo CLI for the given argv and returns the process exit code.
 *
 * Writes the help to stdout for `--help`, `-h`, or an empty argv, and reports any other argument to stderr as not
 * implemented. Never calls `process.exit`: The bin entrypoint owns that, keeping this function testable.
 */
export function run(argv: string[]): number {
  const [first] = argv;
  if (first === undefined || ((first === '--help' || first === '-h') && argv.length === 1)) {
    process.stdout.write(HELP);
    return 0;
  }
  process.stderr.write(`thor-repo: not implemented yet: ${argv.join(' ')}\n`);
  return 2;
}
