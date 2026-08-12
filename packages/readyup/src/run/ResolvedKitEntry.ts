import type { KitProvenance } from '../kits/KitProvenance.ts';

/** Discriminated union describing how to locate the rdy kit. */
export type KitSource = { path: string } | { url: string };

/** A resolved kit entry with its source and checklist filter. */
export interface ResolvedKitEntry {
  name: string;
  source: KitSource;
  checklists: string[];
  provenance?: KitProvenance;
}
