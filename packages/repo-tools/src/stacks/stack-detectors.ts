/** The signals of one stack name: dependency names declared by a tracked `package.json`, and tracked path globs. */
export interface StackDetector {
  dependencies?: readonly string[];
  paths?: readonly string[];
}

/**
 * The stack vocabulary that `thor-repo scan` detects and `thor-repo list --stack` accepts, one detector per name. A
 * path glob matches a tracked path at the repository root or at any depth.
 */
export const STACK_DETECTORS: Readonly<Record<string, StackDetector>> = {
  astro: { dependencies: ['astro'] },
  expo: { dependencies: ['expo'] },
  express: { dependencies: ['express'] },
  netlify: { paths: ['netlify.toml'] },
  nextjs: { dependencies: ['next'] },
  nmr: { dependencies: ['@williamthorsen/nmr'] },
  react: { dependencies: ['react'] },
  supabase: { dependencies: ['@supabase/supabase-js'], paths: ['supabase/config.toml'] },
  svelte: { dependencies: ['svelte'] },
  tailwindcss: { dependencies: ['tailwindcss'] },
  vercel: { paths: ['vercel.json'] },
  vue: { dependencies: ['vue'] },
};
