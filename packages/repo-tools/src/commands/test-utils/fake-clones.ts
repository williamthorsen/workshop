import type { CloneAdapters } from '../verb-run.ts';

/** The home directory under which the fake clones live, at `~/repos/<name>`. */
export const FAKE_HOME = '/home/spec';

/** A fake clone: the paths that git tracks in it, or the reason that git cannot list them, and its files' content. */
export interface FakeClone {
  files: Record<string, string>;
  tracked: string[] | string;
}

/** Builds a clone from its files, writing an object as a manifest that declares those dependencies. */
export function buildClone(files: Record<string, string | Record<string, string>>): FakeClone {
  const contents = Object.fromEntries(
    Object.entries(files).map(([file, content]) => [
      file,
      typeof content === 'string' ? content : JSON.stringify({ dependencies: content }),
    ]),
  );
  return { files: contents, tracked: Object.keys(contents) };
}

/**
 * Returns adapters over clones at `~/repos/<name>`, with the given origins and the registry's branch. Every clone has
 * no linked worktrees, and every rename fails, so that a test reaching one fails visibly.
 */
export function buildFakeAdapters(
  clones: Record<string, FakeClone>,
  origins: Record<string, string> = {},
  branch = 'main',
): CloneAdapters {
  return {
    isDirectory: (dir) => clones[cloneName(dir) ?? ''] !== undefined,
    listTrackedFiles: (dir) => clones[cloneName(dir) ?? '']?.tracked ?? 'fatal: not a git repository',
    listWorktrees: () => [],
    makeDirectory: () => 'not exercised',
    pathExists: (target) => clones[cloneName(target) ?? ''] !== undefined,
    readCurrentBranch: () => branch,
    readDeviceId: () => 1,
    readFile: (file) => {
      const name = cloneName(file) ?? '';
      const content = clones[name]?.files[file.slice(`${FAKE_HOME}/repos/${name}/`.length)];
      if (content === undefined) throw new Error(`absent: ${file}`);
      return content;
    },
    readOriginUrl: (dir) => origins[cloneName(dir) ?? ''],
    readCloneRoot: (dir) => {
      const name = cloneName(dir);
      return name !== undefined && clones[name] !== undefined ? `${FAKE_HOME}/repos/${name}` : undefined;
    },
    renamePath: () => 'not exercised',
    resolvePath: (target) => target,
    repairWorktrees: () => 'not exercised',
  };
}

// region | Helpers

/** Returns the name of the fake clone that contains a path, from its `~/repos/<name>` prefix. */
function cloneName(dir: string): string | undefined {
  return /^\/home\/spec\/repos\/([^/]+)/.exec(dir)?.[1];
}

// endregion | Helpers
