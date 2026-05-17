// Wrapper executed by the externalReadyup integration test.
//
// Usage: node discoverWorkspaces-subprocess-wrapper.mjs <compiledFixturePath> <hookPath>
//
// Registers the readyup resolver hook against the runner's own readyup
// installation (using `import.meta.url` as the parent URL so Node walks
// `node_modules` upward from this file's location into the workspace's readyup
// package), dynamically imports the compiled fixture, locates the first check
// in the first checklist of the default-exported kit, and invokes its `check`
// function. On success the fixture's `check` writes `resolved-ok` to stdout.
//
// `import.meta.url` is unavailable in `node -e` contexts, so a file wrapper
// (not an inline `-e` script) is required for the hook registration to work.

import module from 'node:module';
import process from 'node:process';

const argv = process.argv.slice(2);
const compiledFixturePath = argv[0];
const hookPath = argv[1];

if (!compiledFixturePath || !hookPath) {
  process.stderr.write('wrapper: expected two arguments: <compiledFixturePath> <hookPath>\n');
  process.exit(2);
}

module.register(hookPath, {
  parentURL: import.meta.url,
  data: { readyupParentURL: import.meta.url },
});

const fixtureUrl = new URL(`file://${compiledFixturePath}`).href;
const fixtureModule = await import(fixtureUrl);
const kit = fixtureModule.default;
const firstChecklist = kit?.checklists?.[0];
const firstCheck = firstChecklist?.checks?.[0];

if (typeof firstCheck?.check !== 'function') {
  process.stderr.write('wrapper: could not locate the fixture check\n');
  process.exit(3);
}

await firstCheck.check();
