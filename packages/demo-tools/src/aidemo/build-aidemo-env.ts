import path from 'node:path';

/** The variable that names the Chrome user-data directory on which aidemo records. */
export const CHROME_PROFILE_VARIABLE = 'AIDEMO_CHROME_PROFILE';

/** The directory, relative to the home directory, that holds the default recording profile of each repository. */
export const DEFAULT_CHROME_PROFILES_DIR = '.local/share/thor-demo/chrome-profiles';

/** Variables that make aidemo send narration to OpenAI for captions, even when the voice is local. */
export const OPENAI_VARIABLES: readonly string[] = ['AIDEMO_OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_BASE_URL'];

/**
 * Returns `baseEnv` without the OpenAI variables, overlaid with `declaredEnv`, so that only an OpenAI variable that
 * the configuration declares reaches aidemo. The recording profile is the first non-empty one of `declaredEnv`,
 * `baseEnv`, and `defaultProfileDir`, because aidemo treats an empty value as unset and falls back to a profile inside
 * its install.
 */
export function buildAidemoEnv(
  baseEnv: NodeJS.ProcessEnv,
  declaredEnv: Readonly<Record<string, string>>,
  defaultProfileDir: string,
): NodeJS.ProcessEnv {
  const inherited = Object.entries(baseEnv).filter(([name]) => !OPENAI_VARIABLES.includes(name));
  const profile =
    omitEmpty(declaredEnv[CHROME_PROFILE_VARIABLE]) ?? omitEmpty(baseEnv[CHROME_PROFILE_VARIABLE]) ?? defaultProfileDir;

  return { ...Object.fromEntries(inherited), ...declaredEnv, [CHROME_PROFILE_VARIABLE]: profile };
}

/** Returns the default recording profile of the repository whose takes are archived under `archiveLabel`. */
export function resolveDefaultProfileDir(homeDir: string, archiveLabel: string): string {
  return path.join(homeDir, DEFAULT_CHROME_PROFILES_DIR, archiveLabel);
}

// region | Helpers

/** Returns `value` unless it is empty. */
function omitEmpty(value: string | undefined): string | undefined {
  return value === '' ? undefined : value;
}

// endregion | Helpers
