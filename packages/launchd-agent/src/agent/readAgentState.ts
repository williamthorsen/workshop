import { runLaunchctl } from '../launchctl/runLaunchctl.ts';
import { buildServiceTarget } from './agent-targets.ts';

/**
 * What launchd holds for an agent: nothing, or a loaded agent with the pid of its process when one runs and the exit
 * code of its last run when it has exited.
 */
export type AgentState =
  { loaded: false } | { lastExitCode: number | undefined; loaded: true; pid: number | undefined };

/** Reads whether launchd holds the agent and, when it does, its running pid and last exit code. */
export async function readAgentState(label: string): Promise<AgentState> {
  const { exitCode, output } = await runLaunchctl(['print', buildServiceTarget(label)]);
  if (exitCode !== 0) return { loaded: false };

  const isRunning = /^\s*state = running$/m.test(output);
  const pid = /^\s*pid = (\d+)$/m.exec(output)?.[1];
  const lastExitCode = /^\s*last exit code = (-?\d+)$/m.exec(output)?.[1];

  return {
    lastExitCode: lastExitCode === undefined ? undefined : Number(lastExitCode),
    loaded: true,
    pid: isRunning && pid !== undefined ? Number(pid) : undefined,
  };
}
