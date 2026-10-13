import type { ResolvedKitEntry } from './ResolvedKitEntry.ts';

/** The kits that an invocation selected, and the configured sources from which it selected none. */
export interface KitSelection {
  entries: ResolvedKitEntry[];
  unrunSources: UnrunSource[];
}

/** A configured source that publishes none of the kits that a `--sources` invocation requested. */
export interface UnrunSource {
  /** The source as the config spells it. */
  spelling: string;
  requestedNames: string[];
  /** The kits that the source publishes, in the order of its manifest or kit directory. */
  publishedNames: string[];
}
