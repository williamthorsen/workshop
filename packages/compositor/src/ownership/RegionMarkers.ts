/**
 * The line pair delimiting a region.
 *
 * Each string is the whole content of its marker line, indentation included. Matching ignores that indentation, so a
 * host whose formatter re-indented the region still resolves to the region it already holds; injection writes these
 * strings back verbatim, so the indentation a consumer declared is the indentation the host ends up with.
 *
 * Nothing here is compiled in. A Markdown host fences with `<!-- -->` and a YAML one with `#`, and the engine names
 * neither.
 */
export interface RegionMarkers {
  readonly open: string;
  readonly close: string;
}
