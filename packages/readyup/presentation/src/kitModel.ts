import type { Severity } from '../../src/kits/types.ts';
import type { JsonKitOrigin } from '../../src/schemas/reportSchema.ts';

/** A checklist as a kit page models it, with the duration that its count line reports. */
export interface ChecklistModel {
  name: string;
  ms: number;
  checks: CheckModel[];
}

/**
 * A check as a kit page models it.
 *
 * A check passes when it has no `when` or when its condition is on, and otherwise fails at its severity. `na` makes it
 * skip whatever the environment, and `findings` marks a check that reports the files that it examined. A findings check
 * that declares `examined`, the number of files that it examined, and `sites`, each `path:line` at which it fails, has
 * its progress and its failure detail derived from them.
 */
export interface CheckModel {
  name: string;
  severity: Severity;
  checks?: CheckModel[];
  detail?: string;
  examined?: number;
  failDetail?: string;
  findings?: boolean;
  fix?: string;
  id?: string;
  ms?: number;
  na?: string;
  progress?: [passedCount: number, count: number];
  sites?: string[];
  when?: string;
}

/** A switch in a kit page's environment panel. */
export interface ConditionModel {
  id: string;
  label: string;
  on: boolean;
}

/**
 * A kit's model: the command that runs it, its checklists, the conditions that its environment panel toggles, and its
 * provenance.
 */
export interface KitModel {
  name: string;
  checklists: ChecklistModel[];
  command: string;
  compiledWith?: string;
  conditions: ConditionModel[];
  origin?: JsonKitOrigin;
}
