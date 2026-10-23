import path from 'node:path';

/** Builds the unit name that systemctl addresses a service by: its name with the `.service` suffix. */
export function buildUnitName(name: string): string {
  return `${name}.service`;
}

/** Locates the directory that systemd reads administrator-installed system units from. */
export function findUnitDir(): string {
  return '/etc/systemd/system';
}

/** Locates a service's unit file in the system unit directory. */
export function findUnitPath(name: string): string {
  return path.join(findUnitDir(), buildUnitName(name));
}
