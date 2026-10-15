/** Matches the separator row beneath a table's header. */
const TABLE_SEPARATOR = /^\|(?: *:?-+:? *\|)+ *$/;

/** Matches a cell boundary: a pipe that a backslash does not escape. */
const CELL_BOUNDARY = /(?<!\\)\|/;

/** Returns the index just past the table that starts at `start`, the end of its run of `|` lines. */
export function findTableEnd(lines: readonly string[], start: number): number {
  let end = start;
  while (lines[end]?.startsWith('|') === true) end += 1;
  return end;
}

/** Whether a table starts at `index`: a line starting with `|` whose next line is a separator row. */
export function isTableStart(lines: readonly string[], index: number): boolean {
  return (lines[index] ?? '').startsWith('|') && TABLE_SEPARATOR.test(lines[index + 1] ?? '');
}

/** Splits a table row into its cells, without the empty strings outside its outer pipes. */
export function splitCells(row: string): string[] {
  return row.trim().split(CELL_BOUNDARY).slice(1, -1);
}
