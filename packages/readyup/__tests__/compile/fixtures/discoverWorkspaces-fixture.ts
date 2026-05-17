import { defineRdyKit, discoverWorkspaces } from 'readyup';

export default defineRdyKit({
  description: 'Minimal fixture that exercises a runtime `readyup` import.',
  checklists: [
    {
      name: 'discover-workspaces',
      checks: [
        {
          name: 'resolves readyup at runtime',
          check: () => {
            // Call `discoverWorkspaces` to force the externalized `readyup` specifier
            // to actually resolve at runtime; the return value is intentionally
            // discarded so the fixture is independent of the subprocess's filesystem
            // state. A sentinel on stdout signals successful module resolution.
            discoverWorkspaces();
            process.stdout.write('resolved-ok\n');
            return true;
          },
        },
      ],
    },
  ],
});
