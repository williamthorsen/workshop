/**
 * Where a kit came from, absent only for a kit resolved from the local kits directory.
 *
 * Three kinds, though `--from` accepts six: The six collapse onto three roles that a heading can name,
 * and nothing should record a distinction that no reader ever sees. A source kind introduced later must be
 * added to this union and to the branch that renders it.
 */
export type KitProvenance =
  | { kind: 'directory'; label: string }
  | { kind: 'package'; packageName: string; version: string | undefined }
  | { kind: 'remote'; label: string };
