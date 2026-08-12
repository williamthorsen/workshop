import { resolveSelfVersion } from '@williamthorsen/toolbelt.packaging/candidate';

/** The version readyup declares, reported wherever a runner, report, or kit stamp names its own version. */
export const VERSION: string = resolveSelfVersion(import.meta.url);
