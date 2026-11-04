/** Joins arguments into a POSIX shell command line, single-quoting each one that contains anything but safe characters. */
export function quoteShellArgs(args: readonly string[]): string {
  return args.map((arg) => quoteShellArg(arg)).join(' ');
}

// region | Helpers

/** Quotes one argument for a POSIX shell, leaving it bare when it holds only characters that the shell does not read. */
function quoteShellArg(arg: string): string {
  if (/^[\w%+,./:=@-]+$/.test(arg)) return arg;

  return `'${arg.replaceAll("'", String.raw`'\''`)}'`;
}

// endregion | Helpers
