/**
 * Where a kit came from, absent only for a kit resolved from the local kits directory.
 *
 * Three kinds where `--from` accepts six: the six collapse onto three roles a heading can name, and a
 * distinction no reader ever sees is one nothing should carry. A source kind added later joins this
 * union and the branch that renders it.
 */
export type KitProvenance =
  | { kind: 'directory'; label: string }
  | { kind: 'package'; packageName: string; version: string | undefined }
  | { kind: 'remote'; label: string };
