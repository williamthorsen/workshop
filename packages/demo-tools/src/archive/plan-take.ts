import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

import type { SourceState } from '../clients/git/read-source-state.ts';
import { ARCHIVE_ROOT_VARIABLE, MACHINE_CONFIG_PATH } from '../config/resolve-archive-root.ts';
import type { TakeArchivePlan } from './archive-take.ts';
import { resolveVoice } from './resolve-voice.ts';

/** What `render` does with a take once aidemo succeeds: archive it by a plan, or report why it is not archived. */
export type TakeDisposition = { kind: 'archive'; plan: TakeArchivePlan } | { kind: 'notice'; message: string };

/** What deciding a take's disposition takes, all of it known before aidemo starts. */
export interface PlanTakeInput {
  /** The environment that `thor-demo` passes to aidemo. */
  readonly aidemoEnv: NodeJS.ProcessEnv;
  readonly aidemoVersion: string;
  readonly archiveLabel: string;
  readonly archiveRoot: string | undefined;
  readonly demoDir: string;
  /** The absolute directory that contains the demos. */
  readonly demosRoot: string;
  /** The arguments given to aidemo after the demo directory. */
  readonly params: readonly string[];
  readonly readSourceState: (dir: string) => SourceState | undefined;
  readonly renderedAt: Date;
  readonly root: string;
}

/** The options of a render that writes files named for each language, which a take does not archive. */
const VARIANT_OPTIONS: readonly string[] = ['--lang', '--langs', '--variants'];

/**
 * Decides what to do with a take: Variant renders and a missing archive root get a notice; otherwise the plan
 * captures the source state, the storyboard's checksum, and the resolved voice now, before the render changes
 * anything.
 */
export function planTake(input: PlanTakeInput): TakeDisposition {
  const variantOption = VARIANT_OPTIONS.find((name) =>
    input.params.some((param) => param === name || param.startsWith(`${name}=`)),
  );
  if (variantOption !== undefined) {
    return { kind: 'notice', message: `take not archived: ${variantOption} renders are not archived` };
  }

  if (input.archiveRoot === undefined) {
    return {
      kind: 'notice',
      message: `take not archived: no archive root is set; set archive.root in ~/${MACHINE_CONFIG_PATH} or ${ARCHIVE_ROOT_VARIABLE}`,
    };
  }

  const storyboard = readFileSync(path.join(input.demoDir, 'generated', 'storyboard.json'));

  return {
    kind: 'archive',
    plan: {
      aidemoVersion: input.aidemoVersion,
      archiveRoot: input.archiveRoot,
      demo: path.relative(input.demosRoot, input.demoDir),
      demoDir: input.demoDir,
      label: input.archiveLabel,
      params: input.params,
      renderedAt: input.renderedAt,
      source: input.readSourceState(input.root),
      storyboardSha256: createHash('sha256').update(storyboard).digest('hex'),
      voice: resolveVoice(input.params, readAidemoVisibleEnv(input.root, input.aidemoEnv), parseJson(storyboard)),
    },
  };
}

// region | Helpers

/** Parses JSON, returning `undefined` for text that is not JSON. */
function parseJson(content: Buffer): unknown {
  try {
    return JSON.parse(content.toString('utf8'));
  } catch {
    return undefined;
  }
}

/** Returns the environment that aidemo sees: what `thor-demo` passes, overlaid with the root's `.env`. */
function readAidemoVisibleEnv(root: string, aidemoEnv: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const envFilePath = path.join(root, '.env');
  if (!existsSync(envFilePath)) return aidemoEnv;

  return { ...aidemoEnv, ...parseEnv(readFileSync(envFilePath, 'utf8')) };
}

// endregion | Helpers
