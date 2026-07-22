import { readFile } from './filesystem.ts';

/** Tool names under which a `.tool-versions` file declares Node. asdf writes `nodejs`; mise also accepts `node`. */
const NODE_TOOL_NAMES = new Set(['node', 'nodejs']);

/**
 * Reads the Node version declared in a `.tool-versions` file.
 * Returns undefined when the file is absent or declares no Node version.
 */
export function readToolVersionsNode(relativePath = '.tool-versions'): string | undefined {
  const content = readFile(relativePath);
  if (content === undefined) return undefined;

  for (const line of content.split('\n')) {
    // A `#` opens a comment that runs to the end of the line, whether or not anything precedes it.
    const declaration = (line.split('#')[0] ?? '').trim();
    if (declaration === '') continue;

    const [tool, ...versions] = declaration.split(/\s+/);
    if (tool === undefined || !NODE_TOOL_NAMES.has(tool)) continue;

    // Versions after the first are fallbacks; the first is the one in force.
    const version = versions[0];
    if (version !== undefined) return version;
  }

  return undefined;
}
