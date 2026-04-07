/**
 * Parse a GitHub shorthand string into a raw.githubusercontent.com URL.
 *
 * Format: `org/repo/path[/deeper]@ref` where `@ref` is optional (defaults to `main`).
 */
export function expandGitHubShorthand(shorthand: string): string {
  const atIndex = shorthand.lastIndexOf('@');
  let pathPart: string;
  let ref: string;

  if (atIndex === -1) {
    pathPart = shorthand;
    ref = 'main';
  } else {
    pathPart = shorthand.slice(0, atIndex);
    ref = shorthand.slice(atIndex + 1);
    if (ref === '') {
      throw new Error(`Invalid GitHub shorthand: ref after '@' must not be empty in "${shorthand}"`);
    }
  }

  const segments = pathPart.split('/');
  if (segments.length < 3) {
    throw new Error(`Invalid GitHub shorthand: expected at least "org/repo/file", got "${shorthand}"`);
  }

  const org = segments[0];
  const repo = segments[1];
  const filePath = segments.slice(2).join('/');

  return `https://raw.githubusercontent.com/${org}/${repo}/${ref}/${filePath}`;
}
