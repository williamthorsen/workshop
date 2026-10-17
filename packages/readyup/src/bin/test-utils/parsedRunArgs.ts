/** Builds a `parseRunArgs` return value with the no-flags defaults. */
export function parsedRunArgs(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    kitSpecifiers: [],
    checklists: undefined,
    checklistChecks: undefined,
    filePath: undefined,
    fromValue: undefined,
    urlValue: undefined,
    jit: false,
    internal: false,
    json: false,
    ...overrides,
  };
}
