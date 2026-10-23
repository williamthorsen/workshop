import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runSystemctl } from '../systemctl/runSystemctl.ts';
import { renderUnit, type ServiceSpec } from '../unit/renderUnit.ts';
import { buildUnitName, findUnitPath } from './service-targets.ts';

/** The characters that systemd allows in a unit name, without `@` (templates) and `\` (escapes). */
const SERVICE_NAME_PATTERN = /^[\w.:-]+$/;

/** The characters that systemd allows in a unit name, templates included. */
const DEPENDENCY_NAME_PATTERN = /^[\w.:@-]+$/;

/**
 * Writes the service's unit, enables it, and starts it, replacing whatever ran under the same name, and resolves with
 * the unit's path. Rejects a spec that systemd could not run before writing anything.
 */
export async function installService(spec: ServiceSpec): Promise<string> {
  assertSpecIsInstallable(spec);
  const unitName = buildUnitName(spec.name);
  const unitPath = findUnitPath(spec.name);

  // Set modes explicitly, because a caller's umask of 0 leaves both writable by every user, which systemd warns about.
  await mkdir(spec.logDir, { mode: 0o755, recursive: true });
  await writeFile(unitPath, renderUnit(spec));
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

  // A newline would end the unit line that holds the value.
  const values = [logDir, ...programArguments, ...Object.entries(environment).flat()];
  if (values.some((value) => value.includes('\n'))) {
    throw new Error(`Invalid spec for ${name}: A value must not contain a newline.`);
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
