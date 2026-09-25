import path from 'node:path';

/** Ways out of a kit root, named in the order that the check reports them. */
const ESCAPE_HINT = 'Use --file to run a kit by path, or --from dir:<path> to run one from another directory.';

/**
 * Asserts that a kit name stays inside the directory that roots it.
 *
 * Every named resolution composes the name with a root: `run` joins it onto the project's compile
 * directories, `--from dir:`, `global`, and `npm:` onto theirs, and the GitHub and Bitbucket sources
 * interpolate it into a raw-content URL, in which a `..` traverses on the host rather than here. Checking
 * the name once, where it is parsed, covers all of them.
 *
 * Both separators are treated as one, because a backslash separates on Windows and `deriveKitName`
 * normalizes the two into the `/` that a name uses everywhere.
 */
export function assertRelativeKitName(kitName: string): void {
  if (path.isAbsolute(kitName) || /^[/\\]/.test(kitName)) {
    throw new Error(`Invalid kit name "${kitName}": a kit name is relative to its kit directory. ${ESCAPE_HINT}`);
  }

  if (kitName.split(/[/\\]/).includes('..')) {
    throw new Error(`Invalid kit name "${kitName}": a kit name must not leave its kit directory. ${ESCAPE_HINT}`);
  }
}
