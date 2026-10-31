/** The outcome of expanding a configured value: the expanded text, or the problem that stopped it. */
export type ExpansionResult = { ok: true; value: string } | { ok: false; problem: string };

/**
 * Expands a leading `~` (the whole value, or `~/` at its start) to `homeDir`, then each `${VAR}` from `env`. Any
 * other `${...}` form, an unterminated `${`, or an unset variable is a problem. The `~` check reads the raw value, so
 * a variable whose value starts with `~` stays as it is.
 */
export function expandValue(value: string, env: NodeJS.ProcessEnv, homeDir: string): ExpansionResult {
  const withHome = value === '~' || value.startsWith('~/') ? homeDir + value.slice(1) : value;

  let result = '';
  let rest = withHome;
  for (let start = rest.indexOf('${'); start !== -1; start = rest.indexOf('${')) {
    const end = rest.indexOf('}', start);
    if (end === -1) return { ok: false, problem: `unterminated "${rest.slice(start)}"` };

    const name = rest.slice(start + 2, end);
    if (!/^[A-Za-z_]\w*$/.test(name)) return { ok: false, problem: `unsupported expansion "\${${name}}"` };

    const replacement = env[name];
    if (replacement === undefined) return { ok: false, problem: `${name} is not set` };

    result += rest.slice(0, start) + replacement;
    rest = rest.slice(end + 1);
  }

  return { ok: true, value: result + rest };
}
