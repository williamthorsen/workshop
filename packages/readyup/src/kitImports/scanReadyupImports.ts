import { init, parse } from 'es-module-lexer';

/** A `readyup` or `readyup/*` import a bundle makes, with the names it binds. */
export interface ReadyupImport {
  specifier: string;

  /** Named bindings, empty for a form whose bindings cannot be read statically. */
  names: string[];
}

/**
 * Lists the `readyup` and `readyup/*` imports a compiled bundle makes.
 *
 * Scans the whole bundle rather than its head: esbuild emits each inlined module's external imports inside that
 * module's section, so a kit's later sections have imports of their own.
 *
 * A form whose bindings cannot be read statically -- a namespace import, a default import, a dynamic import, a
 * side-effect import, a star re-export -- yields an entry with no names, so its specifier is still reported while
 * nothing is claimed about what it binds. A specifier naming a JSON module is dropped: it has no named exports to
 * verify, and a runner subpath serving one has no namespace to check against.
 *
 * Throws the lexer's `ParseError` for source it cannot read, which is source Node would not import either.
 */
export async function scanReadyupImports(bundle: string, sourceName?: string): Promise<ReadyupImport[]> {
  await init;
  const [imports] = parse(bundle, sourceName);

  const found: ReadyupImport[] = [];
  for (const entry of imports) {
    const specifier = entry.n;
    if (specifier === undefined || !isReadyupSpecifier(specifier) || specifier.endsWith('.json')) continue;
    found.push({ specifier, names: readBoundNames(bundle.slice(entry.ss, entry.se)) });
  }
  return found;
}

// region | Helpers

/**
 * The clause standing between the leading keyword and the `from` keyword.
 *
 * Greedy up to the last `from` preceding the specifier, so an identifier named `from` inside the clause does not
 * truncate it. A side-effect import has no clause and does not match.
 */
const CLAUSE_PATTERN = /^(?:import|export)\s*([\s\S]*)from\s*["']/;

/** A comment sitting inside an import clause, in either spelling. */
const CLAUSE_COMMENT_PATTERN = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

/** The braced group of a named-import clause, absent for a namespace, default-only, or star form. */
const BRACED_GROUP_PATTERN = /\{([\s\S]*)\}/;

/**
 * The imported name leading one entry of a braced clause, ahead of any `as` rename.
 *
 * Both spellings the grammar allows for the name: a bare identifier, and the quoted form that holds a module-export
 * name an identifier cannot express.
 */
const LEADING_NAME_PATTERN = /^\s*(?:"([^"]*)"|'([^']*)'|([A-Za-z_$][\w$]*))/;

/** Reports whether a specifier names the readyup package or one of its subpaths. */
function isReadyupSpecifier(specifier: string): boolean {
  return specifier === 'readyup' || specifier.startsWith('readyup/');
}

/**
 * Reads the names a single import or re-export statement binds from its braced clause.
 *
 * The statement is one the lexer already identified, so a regular expression is reading trusted input rather than
 * deciding whether the text is an import at all. Comments are removed before the clause is split, since either
 * spelling may sit between a brace and a comma and would otherwise hide the name behind it.
 *
 * Every entry the grammar allows is read: a bare identifier, `name as local`, and `"name" as local`. What yields no
 * name is an entry holding none, which a trailing comma produces. A default binding sits outside the braces and is
 * skipped: jiti's CJS interop supplies a module object for it, so a runner exporting no `default` breaks nothing.
 */
function readBoundNames(statement: string): string[] {
  const clause = CLAUSE_PATTERN.exec(statement)?.[1];
  if (clause === undefined) return [];

  const braced = BRACED_GROUP_PATTERN.exec(clause)?.[1];
  if (braced === undefined) return [];

  const names: string[] = [];
  for (const entry of braced.replaceAll(CLAUSE_COMMENT_PATTERN, ' ').split(',')) {
    const [, quoted, singleQuoted, identifier] = LEADING_NAME_PATTERN.exec(entry) ?? [];
    const name = quoted ?? singleQuoted ?? identifier;
    if (name !== undefined) names.push(name);
  }
  return names;
}

// endregion | Helpers
