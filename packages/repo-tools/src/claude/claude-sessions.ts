/** Returns the name by which Claude Code keeps a directory's sessions: its path with each non-alphanumeric as `-`. */
export function encodeSessionDirectoryName(dir: string): string {
  return dir.replaceAll(/[^a-zA-Z0-9]/g, '-');
}

/** Returns the directory that holds Claude Code's session directories: `$CLAUDE_CONFIG_DIR/projects`, else `~/.claude/projects`. */
export function readSessionsDir(env: Readonly<Record<string, string | undefined>>, home: string): string {
  const configDir = (env['CLAUDE_CONFIG_DIR'] ?? '').replace(/\/+$/, '');
  return `${configDir === '' ? `${home}/.claude` : configDir}/projects`;
}
