import type { Violation } from '../../consistency/Violation.ts';

/** Reports each value that `names` lists twice, in the order the repeats first appear. */
export function findRepeats(names: ReadonlyArray<string>, path: string, verb: string): Array<Violation> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      repeated.add(name);
    }
    seen.add(name);
  }
  return [...repeated].map((name) => ({ path, message: `${verb} "${name}" more than once` }));
}
