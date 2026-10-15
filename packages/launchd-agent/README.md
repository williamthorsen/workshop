<!-- readme-type: library -->

# @williamthorsen/launchd-agent

Install, replace, restart, inspect, and remove per-user launchd agents on macOS.

```ts
import { installAgent } from '@williamthorsen/launchd-agent';

await installAgent({
  label: 'dev.example.watcher',
  logDir: '/Users/me/Library/Logs/watcher',
  programArguments: ['/Users/me/.asdf/installs/nodejs/24.18.0/bin/node', '/Users/me/repos/watcher/bin/run.js'],
  trigger: { keepAlive: true },
});
```

<!-- section:release-notes --><!-- /section:release-notes -->

## Why

Reinstalling an agent with `launchctl bootout` and `bootstrap` races: `bootout` can return while launchd is still dropping the service, and a `bootstrap` issued then fails with a generic error. `installAgent` waits until launchd has dropped the previous instance. The plist that it writes also gives the agent a `PATH` that finds Homebrew's tools and those in `/usr/sbin` and `/sbin` by bare name.

## Installation

```bash
pnpm add @williamthorsen/launchd-agent
```

Node 24 or later and macOS are required.

## API

Every function addresses the agent by its label, in the current user's `gui` domain.

- `installAgent(spec)`: Writes `~/Library/LaunchAgents/<label>.plist` and bootstraps it, replacing any agent loaded under the label. Resolves with the plist's path.
- `readAgentState(label)`: Resolves with `{ loaded: false }`, or `{ loaded: true, pid, lastExitCode }`. `pid` is set while the agent's process runs, and `lastExitCode` once it has exited.
- `restartAgent(label)`: Kills the agent's process and starts it again, which a keep-alive agent needs to load new code. Rejects when launchctl refuses.
- `uninstallAgent(label)`: Boots the agent out and removes its plist. Resolves with `{ wasLoaded }`, which reports whether launchd held it. Rejects, keeping the plist, when the bootout fails and launchd still holds the agent.
- `renderPlist(spec, { homebrewBin })`: Returns the plist that `installAgent` writes, without touching the machine.

An `AgentSpec` has these fields:

- `label`: The launchd label. It names the plist file, so it must not contain `/`.
- `programArguments`: The command that launchd runs. The program must be an absolute path, because launchd has neither a shell nor a working directory.
- `logDir`: The directory that receives `stdout.log` and `stderr.log`.
- `trigger`: `{ keepAlive: true }` to restart the agent whenever it exits, or `{ startIntervalSec }` to run it on an interval. Either way it also starts at load.
- `environment` (optional): More environment variables. The default `PATH` is Homebrew's bin, when Homebrew is found, followed by `/usr/bin:/bin:/usr/sbin:/sbin`; a `PATH` entry here replaces it.
