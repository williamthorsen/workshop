/** Reports whether `name` is a tool's own state rather than content the tree ships. */
export function namesToolState(name: string): boolean {
  return name.startsWith('.');
}
