#!/usr/bin/env node
try {
  await import('../dist/esm/bin/overlay.js');
} catch (error) {
  if (error.code === 'ERR_MODULE_NOT_FOUND') {
    process.stderr.write('overlay: build output not found — run `pnpm run build` first\n');
  } else {
    process.stderr.write(`overlay: failed to load: ${error.message}\n`);
  }
  process.exit(1);
}
