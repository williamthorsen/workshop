/** Formats a Unix epoch in seconds as an ISO 8601 instant in UTC, to the second: `YYYY-MM-DDTHH:MM:SSZ`. */
export function formatIsoTimestamp(epochSeconds: number): string {
  return `${new Date(epochSeconds * 1_000).toISOString().slice(0, 19)}Z`;
}

/** Formats a Unix epoch in seconds as `YYYY-MM-DD` in the local time zone. */
export function formatLocalDate(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1_000);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(date.getFullYear()).padStart(4, '0')}-${month}-${day}`;
}
