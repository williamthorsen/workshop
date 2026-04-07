#!/usr/bin/env node
try {
  await import('../dist/esm/bin/rdy.js');
} catch (error) {
  if (error.code === 'ERR_MODULE_NOT_FOUND') {
    process.stderr.write('rdy: build output not found — run `pnpm run build` first\n');
  } else {
    process.stderr.write(`rdy: failed to load: ${error.message}\n`);
  }
  process.exit(1);
}
