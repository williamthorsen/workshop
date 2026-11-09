import type { AheadBehind } from '../../kits/types.ts';
import { runGit } from './run-git.ts';

/** Returns how many commits `left` is ahead of and behind `right`, or `undefined` when they cannot be computed. */
export async function countAheadBehind(path: string, left: string, right: string): Promise<AheadBehind | undefined> {
  let output: string;
  try {
    output = await runGit(path, 'rev-list', '--count', '--left-right', `${left}...${right}`);
  } catch {
    return undefined;
  }

  const aheadStr = output.split('\t', 1)[0];
  const behindStr = output.split('\t', 2)[1];
  if (aheadStr === undefined || behindStr === undefined) return undefined;
  const ahead = Number(aheadStr);
  const behind = Number(behindStr);
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) return undefined;
  return { ahead, behind };
}
