import type { SourceState } from '../clients/git/read-source-state.ts';

/**
 * Formats a take's directory name: the UTC render start as `YYYYMMDD-HHMMSSZ`, then the short commit with `-dirty`
 * for a work tree with changes, or `nogit` when the source state is unknown.
 */
export function formatTakeDirName(renderedAt: Date, source: SourceState | undefined): string {
  const timestamp = renderedAt
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replaceAll(/[-:]/g, '')
    .replace('T', '-');
  if (source === undefined) return `${timestamp}_nogit`;

  return `${timestamp}_${source.commit.slice(0, 7)}${source.dirty ? '-dirty' : ''}`;
}
