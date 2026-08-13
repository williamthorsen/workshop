import type { JsonPathSpec } from './extractJsonPaths.ts';

/**
 * One file a compile read, as recorded while the compile ran.
 *
 * `path` is absolute; `rdy compile` relativizes it against the manifest directory on the way out, as it
 * already does for a kit's `path` and `source`. Kept distinct from the manifest's own record so that
 * neither type means two different things about its own `path`.
 *
 * A `module` record's hash is over the file's bytes. An `inline` record's is over the projection that was
 * substituted into the bundle, which is why it alone carries the specifier that produced it.
 */
export type CompiledInput =
  { hash: string; kind: 'inline'; path: string; paths: JsonPathSpec } | { hash: string; kind: 'module'; path: string };
