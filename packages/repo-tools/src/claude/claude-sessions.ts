/** Returns the name by which Claude Code keeps a directory's sessions: its path with each non-alphanumeric as `-`. */
export function encodeSessionDirectoryName(dir: string): string {
  return dir.replaceAll(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Returns the directory that holds Claude Code's session directories: `$CLAUDE_CONFIG_DIR/projects`, else
 * `~/.claude/projects`, or `undefined` when neither `CLAUDE_CONFIG_DIR` nor the home directory is known.
 */
export function readSessionsDir(env: Readonly<Record<string, string | undefined>>, home: string): string | undefined {
  const configDir = (env['CLAUDE_CONFIG_DIR'] ?? '').replace(/\/+$/, '');
  if (configDir !== '') return `${configDir}/projects`;
  return home === '' ? undefined : `${home}/.claude/projects`;
}
