#!/usr/bin/env node
try {
  await import('../dist/esm/bin/thor-repo.js');
} catch (error) {
  if (error.code === 'ERR_MODULE_NOT_FOUND') {
    process.stderr.write('thor-repo: build output not found; run `nmr build` first\n');
  } else {
    process.stderr.write(`thor-repo: failed to load: ${error.message}\n`);
  }
  process.exit(1);
}
