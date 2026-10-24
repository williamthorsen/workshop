import path from 'node:path';

/** Builds the unit name that systemctl addresses a service's timer by: its name with the `.timer` suffix. */
export function buildTimerName(name: string): string {
  return `${name}.timer`;
}

/** Builds the unit name that systemctl addresses a service by: its name with the `.service` suffix. */
export function buildUnitName(name: string): string {
  return `${name}.service`;
}

/** Locates a service's timer file in the system unit directory. */
export function findTimerPath(name: string): string {
  return path.join(findUnitDir(), buildTimerName(name));
}

/** Locates the directory that systemd reads administrator-installed system units from. */
export function findUnitDir(): string {
  return '/etc/systemd/system';
}

/** Locates a service's unit file in the system unit directory. */
export function findUnitPath(name: string): string {
  return path.join(findUnitDir(), buildUnitName(name));
}
