import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runSystemctl } from '../systemctl/runSystemctl.ts';
import { renderUnit, type ServiceSpec } from '../unit/renderUnit.ts';
import { buildUnitName, findUnitPath } from './service-targets.ts';

/** The characters that systemd allows in a unit name, without `@` (templates) and `\` (escapes). */
const SERVICE_NAME_PATTERN = /^[\w.:-]+$/;

/** The characters that systemd allows in a unit name, templates included. */
const DEPENDENCY_NAME_PATTERN = /^[\w.:@-]+$/;

/** The environment variable names that systemd accepts: letters, digits, and `_`, not starting with a digit. */
const ENVIRONMENT_KEY_PATTERN = /^[A-Z_a-z]\w*$/;

/** The characters that end a line of a unit file. */
const LINE_BREAK_PATTERN = /[\n\r\0]/;

/**
 * Writes the service's unit, enables it, and starts it, replacing whatever ran under the same name, and resolves with
 * the unit's path. Rejects a spec that systemd could not run before writing anything.
 */
export async function installService(spec: ServiceSpec): Promise<string> {
  assertSpecIsInstallable(spec);
  const unitName = buildUnitName(spec.name);
  const unitPath = findUnitPath(spec.name);

  // Set modes explicitly, because a caller's umask of 0 leaves both writable by every user. `writeFile` sets the mode
  // only when it creates the unit, so `chmod` covers a unit that already exists.
  await mkdir(spec.logDir, { mode: 0o755, recursive: true });
  await writeFile(unitPath, renderUnit(spec), { mode: 0o644 });
  await chmod(unitPath, 0o644);

  await runSystemctlOrThrow(['daemon-reload']);
  await runSystemctlOrThrow(['enable', unitName]);
  // `restart` also replaces a process that is already running, so that the service runs under the new unit.
  await runSystemctlOrThrow(['restart', unitName]);

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

// endregion | Helpers
