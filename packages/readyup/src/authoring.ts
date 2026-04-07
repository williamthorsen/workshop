import type { RdyChecklist, RdyConfig, RdyKit, RdyStagedChecklist } from './types.ts';

/** Type-safe identity function for defining repo-level rdy settings. */
export function defineRdyConfig(config: RdyConfig): RdyConfig {
  return config;
}

/** Type-safe identity function for defining a rdy kit in a config file. */
export function defineRdyKit(kit: RdyKit): RdyKit {
  return kit;
}

/** Type-safe identity function for defining an array of checklists in a config file. */
export function defineChecklists(
  checklists: Array<RdyChecklist | RdyStagedChecklist>,
): Array<RdyChecklist | RdyStagedChecklist> {
  return checklists;
}

/** Type-safe identity function for defining a flat checklist. */
export function defineRdyChecklist(checklist: RdyChecklist): RdyChecklist {
  return checklist;
}

/** Type-safe identity function for defining a staged checklist. */
export function defineRdyStagedChecklist(checklist: RdyStagedChecklist): RdyStagedChecklist {
  return checklist;
}
