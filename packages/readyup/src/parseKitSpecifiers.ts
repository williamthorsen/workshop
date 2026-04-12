/** Parsed kit specifier from a positional argument. */
export interface KitSpecifier {
  kitName: string;
  checklists: string[];
}

/**
 * Parse positional arguments in `kit[:checklist,...]` format into structured specifiers.
 *
 * Splits each positional on the first `:` to separate kit name from comma-separated
 * checklist/suite names. Kit names may contain `/` (e.g., `shared/deploy`).
 */
export function parseKitSpecifiers(positionals: string[]): KitSpecifier[] {
  return positionals.map(parseOneSpecifier);
}

/** Parse a single `kit[:checklist,...]` string into a `KitSpecifier`. */
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
