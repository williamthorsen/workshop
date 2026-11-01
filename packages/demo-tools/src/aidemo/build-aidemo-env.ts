/** Variables that make aidemo send narration to OpenAI for captions, even when the voice is local. */
export const OPENAI_VARIABLES: readonly string[] = ['AIDEMO_OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_BASE_URL'];

/**
 * Returns `baseEnv` without the OpenAI variables, overlaid with `declaredEnv`, so that only an OpenAI variable that
 * the configuration declares reaches aidemo.
 */
export function buildAidemoEnv(
  baseEnv: NodeJS.ProcessEnv,
  declaredEnv: Readonly<Record<string, string>>,
): NodeJS.ProcessEnv {
  const inherited = Object.entries(baseEnv).filter(([name]) => !OPENAI_VARIABLES.includes(name));

  return { ...Object.fromEntries(inherited), ...declaredEnv };
}
