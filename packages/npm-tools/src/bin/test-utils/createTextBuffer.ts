import type { Writer } from '@williamthorsen/toolbelt.cli/candidate';

/** Returns a writer that accumulates what is written to it. */
export function createTextBuffer(): Writer & { readonly text: string } {
  let text = '';

  return {
    get text() {
      return text;
    },
    write(chunk: string) {
      text += chunk;
    },
  };
}
