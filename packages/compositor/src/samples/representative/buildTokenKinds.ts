import type { TokenKindDescriptor } from '../../schemas/descriptor-schemas.ts';

/** Builds the token kinds the representative sample's targets map. */
export function buildTokenKinds(): Array<TokenKindDescriptor> {
  return [
    { id: 'guidance-file', label: 'Guidance file' },
    { id: 'skill-invocation', label: 'Skill invocation' },
    { id: 'tool', label: 'Tool name' },
  ];
}
