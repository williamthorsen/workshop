/**
 * A module evaluated as a kit that does not export `checklists`.
 *
 * Its own class lets a caller add the remedy that fits its context: A compile sweep names `compile.exclude`, which
 * keeps a shared module out of the sweep.
 */
export class MissingChecklistsError extends Error {
  constructor() {
    super(
      'Kit file must export checklists (e.g., `export default defineRdyKit({ checklists: [...] })` or `export const checklists = [...]`)',
    );
    this.name = 'MissingChecklistsError';
  }
}
