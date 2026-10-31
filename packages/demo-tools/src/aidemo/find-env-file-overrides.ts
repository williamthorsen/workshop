import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

import { OPENAI_VARIABLES } from './build-aidemo-env.ts';

/** The OpenAI variables that a `.env` would restore, with the file that sets them. */
export interface EnvFileOverrides {
  readonly envFilePath: string;
  readonly names: string[];
}

/**
 * Returns the OpenAI variables that the `.env` at `root` sets and that `declaredEnv` does not declare, which aidemo
 * would load into its environment after `thor-demo` removed them, or `undefined` when there are none.
 */
export function findEnvFileOverrides(
  root: string,
  declaredEnv: Readonly<Record<string, string>>,
): EnvFileOverrides | undefined {
  const envFilePath = path.join(root, '.env');
  if (!existsSync(envFilePath)) return undefined;

  const fileEnv = parseEnv(readFileSync(envFilePath, 'utf8'));
  const names = OPENAI_VARIABLES.filter((name) => name in fileEnv && !(name in declaredEnv));

  return names.length === 0 ? undefined : { envFilePath, names };
}
