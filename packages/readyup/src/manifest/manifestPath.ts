// Keep this constant in a zod-free module. Re-exporting it from `src/index.ts`
// drags the module's transitive graph into every compiled user kit. Colocating
// it with `manifestSchema.ts` would reintroduce the zod-bloat regression
// captured in issue #59.

/** Default path for the manifest file, relative to the project root. */
export const DEFAULT_MANIFEST_PATH = '.readyup/manifest.json';
