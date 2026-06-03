/**
 * Loads the esbuild module via dynamic import.
 *
 * Isolated behind a named function so tests can replace the esbuild boundary with an ordinary mock,
 * rather than mocking the module and forcing the import to fail through module-cache resets.
 */
export async function loadEsbuild(): Promise<typeof import('esbuild')> {
  return import('esbuild');
}
