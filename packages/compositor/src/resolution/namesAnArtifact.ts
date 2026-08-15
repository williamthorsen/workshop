/**
 * Reports whether `name` can name an artifact, in a source directory or in a destination.
 *
 * A dot prefix is tool state and an underscore prefix is support content: an include target, a shared data directory,
 * anything a tree keeps beside its artifacts. The rule is structural, so the engine excludes them without knowing what
 * any particular one is for.
 *
 * One rule serves both directions, which is what keeps a destination from claiming a name no source would have
 * enumerated. A kind whose name template renders such a name therefore deploys nothing this rule can claim back.
 */
export function namesAnArtifact(name: string): boolean {
  return !name.startsWith('.') && !name.startsWith('_');
}
