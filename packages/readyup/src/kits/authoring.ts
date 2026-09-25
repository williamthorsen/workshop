import type { RdyChecklist, RdyConfig, RdyKit, RdyStagedChecklist } from './types.ts';

/** Returns repo-level rdy settings unchanged, so that their literal is type-checked where it is written. */
export function defineRdyConfig(config: RdyConfig): RdyConfig {
  return config;
}

/** Returns a rdy kit unchanged, so that its literal is type-checked where it is written in a config file. */
export function defineRdyKit(kit: RdyKit): RdyKit {
  return kit;
}

/** Returns an array of checklists unchanged, so that its literal is type-checked where it is written. */
export function defineChecklists(
  checklists: ReadonlyArray<RdyChecklist | RdyStagedChecklist>,
): ReadonlyArray<RdyChecklist | RdyStagedChecklist> {
  return checklists;
}

/** Returns a flat checklist unchanged, so that its literal is type-checked where it is written. */
export function defineRdyChecklist(checklist: RdyChecklist): RdyChecklist {
  return checklist;
}

/** Returns a staged checklist unchanged, so that its literal is type-checked where it is written. */
export function defineRdyStagedChecklist(checklist: RdyStagedChecklist): RdyStagedChecklist {
  return checklist;
}
