import type { FileBlock } from '../schemas/file-schemas.ts';

/**
 * What an ownership transform produced: the rewritten host, or the refusal to write it.
 *
 * The refusal contains the plan's own `FileBlock`, so a caller assembling a file entry forwards it rather than
 * translating one refusal vocabulary into another. Refusal is reserved for facts about the destination -- a damaged
 * marker set, a host that will not parse -- since a plan records the intent and the refusal side by side. A fault in
 * the declaration a consumer wrote throws instead, having no plan entry to belong to.
 */
export type OwnershipOutcome = { readonly content: string } | { readonly blocked: FileBlock };
