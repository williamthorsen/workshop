import { listDuplicateItems } from '@williamthorsen/toolbelt.arrays/candidate';

import type { Violation } from '../../consistency/Violation.ts';

/** Reports each value that `names` lists twice, in the order the repeats first appear. */
export function findRepeats(names: ReadonlyArray<string>, path: string, verb: string): Array<Violation> {
  return listDuplicateItems(names).map((name) => ({ path, message: `${verb} "${name}" more than once` }));
}
