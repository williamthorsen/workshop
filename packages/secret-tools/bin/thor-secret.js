#!/usr/bin/env node

// Imports only node builtins: A top-level import resolves before the gate below runs, so an unresolvable dependency
// would replace this file's build-first message with ERR_MODULE_NOT_FOUND.
import { existsSync } from 'node:fs';

// Thin wrapper so that pnpm can link the bin at install time, before `dist/` exists. The real entry point loads at
// runtime from the build output.
const entryPoint = new URL('../dist/esm/bin/thor-secret.js', import.meta.url);

// Gate on the entry file itself: Node raises ERR_MODULE_NOT_FOUND for any unresolved module in the graph, so keying
// the build-first message off the error code would also fire when the build is present and one of its imports is not.
if (!existsSync(entryPoint)) {
  process.stderr.write(
    'thor-secret: build output not found. In a source checkout, run `nmr build`; otherwise reinstall the package.\n',
  );
  process.exit(1);
}

try {
  await import(entryPoint.href);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`thor-secret: failed to load: ${message}\n`);
  process.exit(1);
}
