/**
 * Reports whether a body is an HTML document rather than the content that was requested.
 *
 * A host serving raw files returns its own HTML page for a missing path under a `200` status, so the
 * status alone does not separate a hit from a miss and the body's opening token has to be inspected.
 */
export function isHtmlBody(body: string): boolean {
  const trimmedBody = body.trimStart().toLowerCase();
  return trimmedBody.startsWith('<html') || trimmedBody.startsWith('<!doctype');
}
