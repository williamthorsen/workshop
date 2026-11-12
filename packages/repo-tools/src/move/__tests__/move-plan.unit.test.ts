import { describe, expect, it } from 'vitest';

import { type ExecuteAdapters, executeMove } from '../move-clone.ts';
import { type PlanAdapters, planMove } from '../move-plan.ts';

const PRIMARY = { from: '/r/oss/app', to: '/r/tools/kit' };

describe(planMove, () => {
  it('moves a sibling worktree beside the new primary, keeping its suffix, and leaves one elsewhere in place', () => {
    const plan = planMove(
      PRIMARY,
      [
        { isPrunable: false, path: '/r/oss/app.live' },
        { isPrunable: false, path: '/r/oss/app/.worktrees/spike' },
        { isPrunable: false, path: '/tmp/scratch' },
        { isPrunable: false, path: '/r/oss/application' },
        { isPrunable: true, path: '/r/oss/app.gone' },
      ],
      fakePlanAdapters(['/r/oss/app', '/r/oss/app.live', '/r/oss/application', '/r']),
    );
    expect(plan).toStrictEqual({
      moves: [PRIMARY, { from: '/r/oss/app.live', to: '/r/tools/kit.live' }],
      primary: PRIMARY,
      repaired: ['/r/tools/kit.live', '/r/tools/kit/.worktrees/spike', '/tmp/scratch', '/r/oss/application'],
      skipped: ['/r/oss/app.gone'],
    });
  });

  it('returns every refusal: an existing destination, another filesystem, and a destination inside the source', () => {
    const adapters = fakePlanAdapters(['/r/oss/app', '/r/oss/app.live', '/r/tools/kit.live', '/r'], { '/mnt': 2 });
    expect(planMove(PRIMARY, [{ isPrunable: false, path: '/r/oss/app.live' }], adapters)).toStrictEqual([
      '/r/tools/kit.live already exists',
    ]);
    expect(planMove({ from: '/r/oss/app', to: '/mnt/disk/app' }, [], adapters)).toStrictEqual([
      '/mnt/disk/app is on another filesystem than /r/oss/app',
    ]);
    expect(planMove({ from: '/r/oss/app', to: '/r/oss/app/inner' }, [], adapters)).toStrictEqual([
      '/r/oss/app/inner is inside /r/oss/app',
    ]);
    expect(planMove({ from: '/r/oss/none', to: '/r/x' }, [], adapters)).toStrictEqual([
      '/r/oss/none is not a directory',
    ]);
  });
});

describe(executeMove, () => {
  it('stops at the first failed rename, returning the completed and the remaining moves', () => {
    const moves = [PRIMARY, { from: '/r/oss/app.live', to: '/r/tools/kit.live' }];
    const repairs: string[][] = [];
    const adapters: ExecuteAdapters = {
      makeDirectory: () => undefined,
      renamePath: (from) => (from === '/r/oss/app.live' ? 'EACCES' : undefined),
      repairWorktrees: (_primary, paths) => {
        repairs.push([...paths]);
        return undefined;
      },
    };
    const outcome = executeMove({ moves, primary: PRIMARY, repaired: ['/r/tools/kit.live'], skipped: [] }, adapters);
    expect(outcome).toStrictEqual({
      completed: [PRIMARY],
      failure: 'cannot move /r/oss/app.live to /r/tools/kit.live: EACCES',
      remaining: [moves[1]],
    });
    expect(repairs).toStrictEqual([]);
  });

  it('reports a repair failure after every rename completed', () => {
    const adapters: ExecuteAdapters = {
      makeDirectory: () => undefined,
      renamePath: () => undefined,
      repairWorktrees: () => 'fatal: bad path',
    };
    const outcome = executeMove({ moves: [PRIMARY], primary: PRIMARY, repaired: ['/tmp/x'], skipped: [] }, adapters);
    expect(outcome).toStrictEqual({
      completed: [PRIMARY],
      failure: 'cannot repair the worktrees of /r/tools/kit: fatal: bad path',
      remaining: [],
    });
  });
});

// region | Helpers

/** Returns probes over a set of existing directories, each on device 1 unless `devices` names a root's device. */
function fakePlanAdapters(existing: readonly string[], devices: Record<string, number> = {}): PlanAdapters {
  const present = new Set([...existing, ...Object.keys(devices), '/']);
  return {
    isDirectory: (dir) => present.has(dir),
    pathExists: (target) => present.has(target),
    readDeviceId: (target) => (present.has(target) ? (devices[target] ?? 1) : undefined),
  };
}

// endregion | Helpers
