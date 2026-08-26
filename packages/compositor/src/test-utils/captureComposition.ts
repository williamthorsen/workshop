import { createTempTree } from '@williamthorsen/toolbelt.filesystem/candidate';
import { disposeOnTestFinished } from '@williamthorsen/toolbelt.vitest/candidate';

import type { CompositorConfig } from '../schemas/config-schemas.ts';
import type { RenderTarget } from '../schemas/render-target-schemas.ts';
import type { CaptureSnapshotInput, CompositionSnapshot } from '../snapshot/captureSnapshot.ts';
import { captureSnapshot } from '../snapshot/captureSnapshot.ts';
import { buildConfig } from './buildConfig.ts';
import { buildClaudeTarget, buildCompositionSourceFiles, COMPOSITION_KINDS } from './composition-fixture.ts';

/** A captured composition, with the config it was captured for and the directories it was captured over. */
export interface CompositionFixture {
  readonly config: CompositorConfig;
  readonly snapshot: CompositionSnapshot;
  readonly sourceDir: string;
  readonly targetRoot: string;
}

/** What a test varies about the composition it captures. */
export interface CaptureCompositionOptions {
  readonly sourceFiles?: Record<string, string | Uint8Array>;
  /** The `sources` block the sole tier declares, defaulting to the temporary source tree under the name `team`. */
  readonly buildSources?: (sourceDir: string) => unknown;
  readonly targetFiles?: Record<string, string | Uint8Array>;
  /** The `select` block the sole tier declares, defaulting to everything the source contains of each deployed kind. */
  readonly select?: unknown;
  /** The `inlays` block the sole tier declares, defaulting to an empty block. */
  readonly inlays?: unknown;
  readonly buildTargets?: (targetRoot: string) => ReadonlyArray<RenderTarget>;
  readonly input?: Partial<CaptureSnapshotInput>;
}

/**
 * Captures a composition over a temporary source tree and target root, both removed when the test ends.
 *
 * The whole point of the seam under test is that composing reads nothing, so a fixture that captured from mocks would
 * exercise the wrong half. What varies between tests is the content of the two trees and the config read against them.
 */
export async function captureComposition(options: CaptureCompositionOptions = {}): Promise<CompositionFixture> {
  const sourceFiles = options.sourceFiles ?? buildCompositionSourceFiles();
  const { dir: sourceDir } = disposeOnTestFinished(createTempTree(sourceFiles, { prefix: 'compositor-source-' }));
  const targetFiles = options.targetFiles ?? { '.keep': '' };
  const { dir: targetRoot } = disposeOnTestFinished(createTempTree(targetFiles, { prefix: 'compositor-target-' }));

  const config = buildConfig([
    {
      id: 'project',
      sources: options.buildSources?.(sourceDir) ?? { use: [{ name: 'team', path: sourceDir }] },
      select: options.select ?? {
        collection: { use: [{ source: 'team' }] },
        rulebook: { use: [{ source: 'team' }] },
        skill: { use: [{ source: 'team' }] },
      },
      inlays: options.inlays,
    },
  ]);

  const snapshot = await captureSnapshot({
    config,
    baseDir: targetRoot,
    kinds: COMPOSITION_KINDS,
    targets: options.buildTargets?.(targetRoot) ?? [buildClaudeTarget(targetRoot)],
    tokenKinds: [],
    edgeRules: [],
    kindKeys: {},
    contentKeyPath: ['compositor', 'content'],
    ...options.input,
  });

  return { config, snapshot, sourceDir, targetRoot };
}
