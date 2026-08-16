import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { disposeOnTestFinished } from '@williamthorsen/toolbelt.vitest/candidate';

/** Builds a directory holding each path in `files` with the given content, removed when the test ends. */
export function buildConfigDir(files: Record<string, string>): string {
  return disposeOnTestFinished(createTempTree(files, { prefix: 'compositor-config-' })).dir;
}
