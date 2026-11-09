import process from 'node:process';

import { getLayout } from '../layout/engine.ts';

/** Writes a remediation hint to stderr through the selected style, when there is one. */
export function writeHint(hint: string | undefined): void {
  if (hint !== undefined) {
    process.stderr.write(getLayout().formatHint(hint) + '\n');
  }
}
