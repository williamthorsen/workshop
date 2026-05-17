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
            // Reference `discoverWorkspaces` (a value, not just a type) so esbuild
            // cannot dead-code-eliminate the externalized `readyup` import. We
            // verify the binding is a function rather than invoking it — calling
            // `discoverWorkspaces()` reads from `process.cwd()`, which couples
            // the resolution signal to the subprocess's filesystem state. The
            // sentinel on stdout signals successful module resolution alone.
            if (typeof discoverWorkspaces !== 'function') {
              throw new TypeError('discoverWorkspaces did not resolve to a function');
            }
            process.stdout.write('resolved-ok\n');
            return true;
          },
        },
      ],
    },
  ],
});
