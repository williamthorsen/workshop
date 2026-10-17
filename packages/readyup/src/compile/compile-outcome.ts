import process from 'node:process';

import { EXIT_OK, EXIT_PROBLEMS_FOUND } from '../bin/exitCodes.ts';
import type { RaisedWarning } from '../schemas/common.ts';
import {
  type JsonCompileKitEntry,
  type JsonCompileOutput,
  type JsonCompileProjectEntry,
  type JsonCompileRemovedEntry,
  SCHEMA_VERSION,
} from '../schemas/compileOutputSchema.ts';

/**
 * Each kit's outcome in a project compile, the bundles that it removed, the warnings that its kits raised, and the next
 * step that it names.
 */
export interface ProjectCompileOutcome {
  /** The next step for a project without kit sources or a manifest. */
  hint?: string;
  kits: JsonCompileKitEntry[];
  removed: JsonCompileRemovedEntry[];
  warnings: RaisedWarning[];
}

/** What a compile run did, gathered for its payload and its exit code. */
export interface CompileRunOutcome extends ProjectCompileOutcome {
  /** Every project that a recursive compile visited; absent from any other run. */
  projects?: JsonCompileProjectEntry[];
}

/**
 * Emits the compile payload under `--json` and reduces the run's per-kit statuses to an exit code.
 *
 * A kit left alone because it drifted counts against the run just as a failed one does: Both mean
 * the compiled output on disk is not what the source says it should be. A warning counts against nothing,
 * and appears in the payload only when one was raised, as a removal does.
 *
 * A project that failed counts against the run whether or not it contributed a kit.
 */
export function finishCompile(outcome: CompileRunOutcome, json: boolean): number {
  const { hint, kits, projects, removed, warnings } = outcome;
  const passed = kits.every((kit) => kit.status === 'compiled') && (projects ?? []).every((project) => project.passed);

  if (json) {
    const output: JsonCompileOutput = {
      schemaVersion: SCHEMA_VERSION,
      passed,
      kits,
      ...(projects !== undefined && { projects }),
      ...(removed.length > 0 && { removed }),
      ...(warnings.length > 0 && { warnings }),
      ...(hint !== undefined && { hint }),
    };
    process.stdout.write(JSON.stringify(output) + '\n');
  }

  return passed ? EXIT_OK : EXIT_PROBLEMS_FOUND;
}
