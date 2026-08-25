/** Parsed kit specifier from a positional argument. */
export interface KitSpecifier {
  kitName: string;
  checklists: string[];
}

/**
 * Returns positional arguments in `kit[:checklist,...]` format as structured specifiers.
 *
 * Each positional splits on its first `:`, separating the kit name from the comma-separated
 * checklist and suite names. A kit name may itself contain `/`, as `shared/deploy` does.
 */
export function parseKitSpecifiers(positionals: string[]): KitSpecifier[] {
  return positionals.map(parseOneSpecifier);
}

/** Returns a single `kit[:checklist,...]` string as a `KitSpecifier`. */
function parseOneSpecifier(arg: string): KitSpecifier {
  const colonIndex = arg.indexOf(':');
  if (colonIndex === -1) {
    return { kitName: arg, checklists: [] };
  }

  const kitName = arg.slice(0, colonIndex);
  if (kitName === '') {
    throw new Error(`Invalid kit specifier "${arg}": kit name must not be empty`);
  }

  const checklists = arg
    .slice(colonIndex + 1)
    .split(',')
    .filter((s) => s !== '');
  if (checklists.length === 0) {
    throw new Error(`Invalid kit specifier "${arg}": checklist list after ":" must not be empty`);
  }

  return { kitName, checklists };
}
