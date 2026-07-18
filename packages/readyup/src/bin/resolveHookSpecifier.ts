/**
 * Resolves the readyup resolver-hook specifier for `module.register`, choosing the extension
 * from the runner's own URL — `.ts` under tsx, `.js` in the compiled build — so registration
 * works identically from `src` and from `dist/esm`.
 */
export function resolveHookSpecifier(runnerUrl: string): string {
  const extension = runnerUrl.endsWith('.ts') ? '.ts' : '.js';
  return `../readyupResolverHook${extension}`;
}
