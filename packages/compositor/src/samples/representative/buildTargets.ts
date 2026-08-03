import type { TargetEntry } from '../../schemas/target-schemas.ts';

/** Builds the targets the representative sample renders into. */
export function buildTargets(): Array<TargetEntry> {
  return [
    {
      id: 'claude',
      label: 'Claude',
      root: '~/.claude',
      tokenMappings: [
        { kindId: 'skill-invocation', entries: [], sigil: '/' },
        {
          kindId: 'tool',
          entries: [
            { from: 'Edit', to: 'Edit' },
            { from: 'Read', to: 'Read' },
          ],
        },
      ],
      variables: [{ name: 'guidanceFile', value: 'CLAUDE.md' }],
    },
    {
      id: 'rovodev',
      label: 'Rovo Dev',
      root: '~/.rovodev',
      tokenMappings: [
        { kindId: 'skill-invocation', entries: [], sigil: '!' },
        {
          kindId: 'tool',
          entries: [
            { from: 'Edit', to: 'edit_file' },
            { from: 'Read', to: 'open_files' },
          ],
        },
      ],
      variables: [{ name: 'guidanceFile', value: 'AGENTS.md' }],
    },
  ];
}
