import { runLaunchctl } from '../launchctl/runLaunchctl.ts';
import { buildServiceTarget } from './agent-targets.ts';

/**
 * Kills the agent's process and starts it again. A keep-alive agent otherwise runs the code that it loaded until its
 * process exits.
 */
export async function restartAgent(label: string): Promise<void> {
  const { exitCode, output } = await runLaunchctl(['kickstart', '-k', buildServiceTarget(label)]);
  if (exitCode !== 0) {
    throw new Error(`launchctl kickstart failed: ${output.trim()}`);
  }
}
