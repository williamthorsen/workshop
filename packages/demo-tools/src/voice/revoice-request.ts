import type { TakeDisposition } from '../archive/plan-take.ts';
import type { VoiceConfig } from '../config/read-machine-config.ts';

/** A validated `revoice` for the entry point to perform: the aidemo stages to run against the proxy, and the take. */
export interface RevoiceRequest {
  /** The aidemo bin, which the entry point runs with the node that runs `thor-demo`. */
  readonly bin: string;
  readonly cwd: string;
  /** aidemo's environment, to which the performer adds the proxy's base URL. */
  readonly env: NodeJS.ProcessEnv;
  /** The arguments of each aidemo stage, run in order. */
  readonly stages: readonly (readonly string[])[];
  readonly take: TakeDisposition;
  readonly voice: VoiceConfig;
}
