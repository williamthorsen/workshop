import { defineRootVitestConfig } from '@williamthorsen/nmr/vitest';

// `startDir` pins the monorepo root to this file rather than the working directory, so the workspace exclusions hold
// wherever the run is invoked from. No check enforces it; a green survey is not evidence it is present.
export default defineRootVitestConfig({ startDir: import.meta.dirname });
