<!-- readme-type: library -->

# @williamthorsen/systemd-service

Install, restart, inspect, and remove systemd system services on Linux.

```ts
import { installService } from '@williamthorsen/systemd-service';

await installService({
  after: ['docker.service'],
  logDir: '/var/log/watcher',
  name: 'dev.example.watcher',
  programArguments: ['/usr/local/bin/node', '/srv/watcher/bin/run.js'],
});
```

A program that runs on a schedule takes a trigger instead:

```ts
await installService({
  logDir: '/var/log/daily-check',
  name: 'dev.example.daily-check',
  programArguments: ['/usr/local/bin/daily-check', '--notify'],
  trigger: { startIntervalSec: 86_400 },
});
```

<!-- section:release-notes --><!-- /section:release-notes -->

## Why

A hand-written unit for a long-running program usually needs the same settings, and it is easy to miss one. By default, the unit that `installService` writes restarts the service 10 seconds after each exit and never gives up, where systemd's default start limit stops a service that exits repeatedly. A scheduled service is run instead by a timer, at install, at each boot, and once per interval, so that a run missed while the machine was off is made up after boot, as launchd does for an agent at load. Either kind appends stdout and stderr to files in one log directory, so the logs can be read the same way as those of a launchd agent installed by [`@williamthorsen/launchd-agent`](https://github.com/williamthorsen/workshop/tree/main/packages/launchd-agent#readme), whose API this package mirrors.

## Installation

```bash
pnpm add @williamthorsen/systemd-service
```

Node 24 or later and Linux with systemd are required. Every function except `renderTimer` and `renderUnit` runs `systemctl` on the system manager, so the caller must run as root.

## API

Every function addresses the service by its name, as the unit `<name>.service` in `/etc/systemd/system`, and the timer of a scheduled service as `<name>.timer` beside it.

- `installService(spec)`: Writes the unit, and the timer of a scheduled service, then reloads systemd and enables and starts the service or its timer, replacing a service of either kind already installed under the name. Resolves with the unit's path. Rejects an invalid spec before writing anything.
- `readServiceState(name)`: Resolves with `{ loaded: false }`, or `{ loaded: true, pid, lastExitCode }`. `pid` is set while the service's process runs. `lastExitCode` is set after the process exits, until systemd starts it again; a process ended by a signal reports 128 plus the signal number.
- `restartService(name)`: Stops the service's process and starts it again, which a running service needs to load new code. A scheduled service runs now, and the call resolves when the run ends. Rejects when systemctl refuses, which includes a scheduled run that fails.
- `uninstallService(name)`: Stops and disables the service and its timer and removes their units. Resolves with `{ wasLoaded }`, which reports whether systemd had it loaded. Rejects, keeping the unit, when disabling fails and the service is still active.
- `renderTimer(spec)`: Returns the timer that `installService` writes for a scheduled service, or `undefined` for a kept-alive one, without touching the machine.
- `renderUnit(spec)`: Returns the unit that `installService` writes, without touching the machine.

A `ServiceSpec` has these fields:

- `name`: The service's name, without the `.service` suffix. It may contain only letters, digits, and `:_.-`.
- `programArguments`: The command that systemd runs. The program must be an absolute path.
- `logDir`: The absolute directory that receives `stdout.log` and `stderr.log`. systemd appends to them.
- `environment` (optional): More environment variables, each named with letters, digits, and `_`, and not starting with a digit. systemd's default `PATH` for system services is `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin`; a `PATH` entry here replaces it.
- `after` (optional): Units that the service starts after and pulls in, such as `docker.service`.
- `trigger` (optional): `{ keepAlive: true }`, the default, to restart the service whenever it exits, or `{ startIntervalSec }` to run it at install, at each boot, and every `startIntervalSec` seconds after its last start. The interval must be a positive integer. A start that falls due while a run continues is skipped.
