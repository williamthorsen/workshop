import type { TargetEntry } from '../../schemas/target-schemas.ts';

/** Builds the targets the representative sample renders into. */
export function buildTargets(): Array<TargetEntry> {
  return [
    {
      id: 'claude',
      label: 'Claude',
      root: '~/.claude',
      tokenMappings: [
        { kindId: 'guidance-file', entries: [{ from: 'guidanceFile', to: 'CLAUDE.md' }] },
        { kindId: 'skill-invocation', entries: [], sigil: '/' },
        {
          kindId: 'tool',
          entries: [
            { from: 'Edit', to: 'Edit' },
            { from: 'Read', to: 'Read' },
          ],
        },
      ],
    },
    {
      id: 'rovodev',
      label: 'Rovo Dev',
      root: '~/.rovodev',
      tokenMappings: [
        { kindId: 'guidance-file', entries: [{ from: 'guidanceFile', to: 'AGENTS.md' }] },
        { kindId: 'skill-invocation', entries: [], sigil: '!' },
        {
          kindId: 'tool',
          entries: [
            { from: 'Edit', to: 'edit_file' },
            { from: 'Read', to: 'open_files' },
          ],
        },
      ],
    },
  ];
}
