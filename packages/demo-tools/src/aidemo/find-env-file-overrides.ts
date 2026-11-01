import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/** The variables that a `.env` would set in aidemo's environment, with the file that sets them. */
export interface EnvFileOverrides {
  readonly envFilePath: string;
  readonly names: string[];
}

/**
 * Returns those of `names` that the `.env` at `root` sets and that `declaredEnv` does not declare, which aidemo would
 * load over the environment that `thor-demo` passes, or `undefined` when there are none.
 */
export function findEnvFileOverrides(
  root: string,
  declaredEnv: Readonly<Record<string, string>>,
  names: readonly string[],
): EnvFileOverrides | undefined {
  const envFilePath = path.join(root, '.env');
  if (!existsSync(envFilePath)) return undefined;

  const fileEnv = parseEnv(readFileSync(envFilePath, 'utf8'));
  const found = names.filter((name) => Object.hasOwn(fileEnv, name) && !Object.hasOwn(declaredEnv, name));

  return found.length === 0 ? undefined : { envFilePath, names: found };
}
