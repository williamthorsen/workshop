#!/usr/bin/env node
try {
  await import('../dist/esm/bin/thor-node.js');
} catch (error) {
  if (error.code === 'ERR_MODULE_NOT_FOUND') {
    process.stderr.write('thor-node: build output not found; run `nmr build` first\n');
  } else {
    process.stderr.write(`thor-node: failed to load: ${error.message}\n`);
  }
  process.exit(1);
}
