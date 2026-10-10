#!/usr/bin/env node
try {
  await import('../dist/esm/bin/thor-secret.js');
} catch (error) {
  if (error.code === 'ERR_MODULE_NOT_FOUND') {
    process.stderr.write('thor-secret: build output not found; run `nmr build` first\n');
  } else {
    process.stderr.write(`thor-secret: failed to load: ${error.message}\n`);
  }
  process.exit(1);
}
