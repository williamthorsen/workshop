import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runSystemctl } from '../systemctl/runSystemctl.ts';
import { renderTimer } from '../unit/renderTimer.ts';
import { readStartIntervalSec, renderUnit, type ServiceSpec } from '../unit/renderUnit.ts';
import { isFile } from './isFile.ts';
import { removeTimer } from './removeTimer.ts';
import { buildTimerName, buildUnitName, findTimerPath, findUnitPath } from './service-targets.ts';

/** The characters that systemd allows in a unit name, without `@` (templates) and `\` (escapes). */
const SERVICE_NAME_PATTERN = /^[\w.:-]+$/;

/** The characters that systemd allows in a unit name, templates included. */
const DEPENDENCY_NAME_PATTERN = /^[\w.:@-]+$/;

/** The environment variable names that systemd accepts: letters, digits, and `_`, not starting with a digit. */
const ENVIRONMENT_KEY_PATTERN = /^[A-Z_a-z]\w*$/;

/** The characters that end a line of a unit file. */
const LINE_BREAK_PATTERN = /[\n\r\0]/;

/**
 * Writes the service's unit, and the timer of a scheduled service, enables the service or its timer, and starts it,
 * replacing whatever ran under the same name, of either kind, and resolves with the unit's path. Rejects a spec that
 * systemd could not run before writing anything.
 */
export async function installService(spec: ServiceSpec): Promise<string> {
  assertSpecIsInstallable(spec);
  const unitName = buildUnitName(spec.name);
  const unitPath = findUnitPath(spec.name);
  const timer = renderTimer(spec);

  if (timer === undefined) {
    await removeTimer(spec.name);
  } else if (await isFile(unitPath)) {
    // A kept-alive install left a `multi-user.target.wants` link, which only the `[Install]` section of the unit that
    // made it tells `disable` to remove.
    await runSystemctlOrThrow(['disable', unitName]);
  }

  // Set the directory's mode explicitly, because a caller's umask of 0 leaves it writable by every user.
  await mkdir(spec.logDir, { mode: 0o755, recursive: true });
  await writeUnitFile(unitPath, renderUnit(spec));
  if (timer === undefined) {
    await runSystemctlOrThrow(['daemon-reload']);
    await runSystemctlOrThrow(['enable', unitName]);
    // `restart` also replaces a process that is already running, so that the service runs under the new unit.
    await runSystemctlOrThrow(['restart', unitName]);
    return unitPath;
  }

  const timerName = buildTimerName(spec.name);
  await writeUnitFile(findTimerPath(spec.name), timer);
  await runSystemctlOrThrow(['daemon-reload']);
  // Stop a process left running by the previous install, which the timer would otherwise skip starting over.
  await runSystemctlOrThrow(['stop', unitName]);
  await runSystemctlOrThrow(['enable', timerName]);
  // `restart` re-arms a timer that is already active, so that `OnActiveSec=0` runs the new unit at once.
  await runSystemctlOrThrow(['restart', timerName]);

  return unitPath;
}

// region | Helpers

/** Throws when the spec contains a value that would not survive as a unit setting or that systemd would refuse. */
function assertSpecIsInstallable(spec: ServiceSpec): void {
  const { after = [], environment = {}, logDir, name, programArguments } = spec;

  if (!SERVICE_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid service name "${name}": A name may contain only letters, digits, and ":_.-".`);
  }

  const program = programArguments[0];
  if (program === undefined || !path.isAbsolute(program)) {
    throw new Error(`Invalid program for ${name}: The first program argument must be an absolute path.`);
  }

  if (!path.isAbsolute(logDir)) {
    throw new Error(`Invalid log directory for ${name}: The log directory must be an absolute path.`);
  }

  const startIntervalSec = readStartIntervalSec(spec);
  if (startIntervalSec !== undefined && !(Number.isSafeInteger(startIntervalSec) && startIntervalSec > 0)) {
    throw new Error(`Invalid interval for ${name}: startIntervalSec must be a positive integer.`);
  }

  const invalidDependency = after.find((unit) => !DEPENDENCY_NAME_PATTERN.test(unit));
  if (invalidDependency !== undefined) {
    throw new Error(`Invalid dependency "${invalidDependency}" for ${name}: It is not a unit name.`);
  }

  const invalidKey = Object.keys(environment).find((key) => !ENVIRONMENT_KEY_PATTERN.test(key));
  if (invalidKey !== undefined) {
    throw new Error(`Invalid environment variable "${invalidKey}" for ${name}: It is not a valid variable name.`);
  }

  // A line break would end the unit line that holds the value.
  const values = [logDir, ...programArguments, ...Object.values(environment)];
  if (values.some((value) => LINE_BREAK_PATTERN.test(value))) {
    throw new Error(`Invalid spec for ${name}: A value must not contain a line break.`);
  }
}

/** Runs a systemctl subcommand, throwing with its output when it exits nonzero. */
async function runSystemctlOrThrow(args: readonly string[]): Promise<void> {
  const { exitCode, output } = await runSystemctl(args);
  if (exitCode !== 0) {
    throw new Error(`systemctl ${args.join(' ')} failed: ${output.trim()}`);
  }
}

/**
 * Writes a unit file readable by every user and writable only by its owner. `writeFile` sets the mode only when it
 * creates the file, so `chmod` covers one that already exists, whatever the caller's umask.
 */
async function writeUnitFile(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, { mode: 0o644 });
  await chmod(filePath, 0o644);
}

// endregion | Helpers
