export { installAgent } from './agent/installAgent.ts';
export { type AgentState, readAgentState } from './agent/readAgentState.ts';
export { restartAgent } from './agent/restartAgent.ts';
export { uninstallAgent, type UninstallOutcome } from './agent/uninstallAgent.ts';
export { type AgentSpec, type AgentTrigger, renderPlist, type RenderPlistOptions } from './plist/renderPlist.ts';
