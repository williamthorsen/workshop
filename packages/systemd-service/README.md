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

<!-- section:release-notes --><!-- /section:release-notes -->

## Why

A hand-written unit for a long-running program usually needs the same settings, and it is easy to miss one. The unit that `installService` writes restarts the service 10 seconds after each exit and never gives up, where systemd's default start limit stops a service that exits repeatedly. It also appends stdout and stderr to files in one log directory, so the logs can be read the same way as those of a launchd agent installed by [`@williamthorsen/launchd-agent`](https://github.com/williamthorsen/workshop/tree/main/packages/launchd-agent#readme), whose API this package mirrors.

## Installation

```bash
pnpm add @williamthorsen/systemd-service
```

Node 24 or later and Linux with systemd are required. Every function except `renderUnit` runs `systemctl` on the system manager, so the caller must run as root.

## API

Every function addresses the service by its name, as the unit `<name>.service` in `/etc/systemd/system`.

- `installService(spec)`: Writes the unit, then reloads systemd, enables the service, and restarts it, which replaces a service already running under the name. Resolves with the unit's path. Rejects an invalid spec before writing anything.
- `readServiceState(name)`: Resolves with `{ loaded: false }`, or `{ loaded: true, pid, lastExitCode }`. `pid` is set while the service's process runs. `lastExitCode` is set after the process exits, until systemd starts it again; a process ended by a signal reports 128 plus the signal number.
- `restartService(name)`: Stops the service's process and starts it again, which a running service needs to load new code. Rejects when systemctl refuses.
- `uninstallService(name)`: Stops and disables the service and removes its unit. Resolves with `{ wasLoaded }`, which reports whether systemd had it loaded. Rejects, keeping the unit, when disabling fails and the service is still active.
- `renderUnit(spec)`: Returns the unit that `installService` writes, without touching the machine.

A `ServiceSpec` has these fields:

- `name`: The service's name, without the `.service` suffix. It may contain only letters, digits, and `:_.-`.
- `programArguments`: The command that systemd runs. The program must be an absolute path.
- `logDir`: The absolute directory that receives `stdout.log` and `stderr.log`. systemd appends to them.
- `environment` (optional): More environment variables. systemd's default `PATH` for system services is `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin`; a `PATH` entry here replaces it.
- `after` (optional): Units that the service starts after and pulls in, such as `docker.service`.
