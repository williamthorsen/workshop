import type { SourceEntry } from '../../schemas/descriptor-schemas.ts';

/** Builds the sources the representative sample resolves from, in precedence order, where the order is the meaning. */
export function buildSources(): Array<SourceEntry> {
  return [
    { id: 'team', name: 'team', origin: { kind: 'directory', location: '/srv/team-guidance' } },
    { id: 'packaged', name: 'packaged', origin: { kind: 'package', location: '@acme/guidance' } },
    { id: 'library', name: 'library', origin: { kind: 'directory', location: '/opt/compositor/library' } },
  ];
}
