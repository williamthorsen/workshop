#!/usr/bin/env node

// Imports only node builtins: A top-level import resolves before the gate below runs, so an unresolvable dependency
// would replace this file's build-first message with ERR_MODULE_NOT_FOUND.
import { existsSync } from 'node:fs';

// Thin wrapper so that pnpm can link the bin at install time, before `dist/` exists. It loads the TypeScript source
// when `src/` is present, which only a source checkout has, because `files` leaves `src/` out of the published package.
// Otherwise it loads the build output.
const sourceEntryPoint = new URL('../src/bin/rdy.ts', import.meta.url);
const buildEntryPoint = new URL('../dist/esm/bin/rdy.js', import.meta.url);
const entryPoint = [sourceEntryPoint, buildEntryPoint].find((url) => existsSync(url));

// Gate on the entry file itself: Node raises ERR_MODULE_NOT_FOUND for any unresolved module in the graph, so keying
// the build-first message off the error code would also fire when the build is present and one of its imports is not.
if (entryPoint === undefined) {
  process.stderr.write('rdy: build output not found. Reinstall the package.\n');
  process.exit(1);
}

try {
  await import(entryPoint.href);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`rdy: failed to load: ${message}\n`);
  process.exit(1);
}
