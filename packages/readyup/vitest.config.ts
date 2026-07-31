import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

// This package keeps a config of its own, against the general rule that packages inherit the root one. The rule
// targets configs that merely restate the shared config; this one carries a package-scoped setting that has no
// root-level expression, since a `project` override at the root would apply to every package.
//
// Pinning the style keeps rendering deterministic: left to detection, output would follow whether the runner attached
// a terminal and whether CI was set, so the same assertion would pass locally and fail on the runner. A test wanting
// plain output passes `--style plain`, which outranks this.
export default defineVitestConfig({ project: { env: { RDY_STYLE: 'rich' } } });
