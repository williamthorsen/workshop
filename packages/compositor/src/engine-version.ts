/**
 * The engine's own version, which every plan records as the thing that produced it.
 *
 * Declared here rather than read from the manifest at run time, the compiled tree and the source tree standing at
 * different depths below it. A drift test holds the two in step.
 */
export const ENGINE_VERSION = '0.1.0';
