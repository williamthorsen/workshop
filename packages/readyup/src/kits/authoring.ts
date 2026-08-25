import type { RdyChecklist, RdyConfig, RdyKit, RdyStagedChecklist } from './types.ts';

/** Returns repo-level rdy settings unchanged, so their literal is type-checked where it is written. */
export function defineRdyConfig(config: RdyConfig): RdyConfig {
  return config;
}

/** Returns a rdy kit unchanged, so its literal is type-checked where it is written in a config file. */
export function defineRdyKit(kit: RdyKit): RdyKit {
  return kit;
}

/** Returns an array of checklists unchanged, so its literal is type-checked where it is written. */
export function defineChecklists(
  checklists: Array<RdyChecklist | RdyStagedChecklist>,
): Array<RdyChecklist | RdyStagedChecklist> {
  return checklists;
}

/** Returns a flat checklist unchanged, so its literal is type-checked where it is written. */
export function defineRdyChecklist(checklist: RdyChecklist): RdyChecklist {
  return checklist;
}

/** Returns a staged checklist unchanged, so its literal is type-checked where it is written. */
export function defineRdyStagedChecklist(checklist: RdyStagedChecklist): RdyStagedChecklist {
  return checklist;
}
