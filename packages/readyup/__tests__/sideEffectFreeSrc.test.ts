import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { isRecord } from '../src/isRecord.ts';

const thisFileDir = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(thisFileDir, '..', 'src');
const PACKAGE_JSON_PATH = join(thisFileDir, '..', 'package.json');

/**
 * Files in `src/` that intentionally carry top-level side effects (CLI entry points, etc.).
 * Each entry is a src-relative POSIX path. The corresponding compiled output MUST appear in
 * package.json's `sideEffects` array so bundlers don't tree-shake it.
 */
const INTENTIONAL_SIDE_EFFECT_FILES = new Set<string>(['bin/rdy.ts']);

/** TypeScript AST kinds that represent purely declarative top-level statements. */
const DECLARATIVE_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.ImportDeclaration,
  ts.SyntaxKind.ImportEqualsDeclaration,
  ts.SyntaxKind.ExportDeclaration,
  ts.SyntaxKind.ExportAssignment,
  ts.SyntaxKind.VariableStatement,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.ModuleDeclaration,
]);

interface Offender {
  line: number;
  kind: string;
  snippet: string;
}

describe('readyup source tree is side-effect-free', () => {
  const files = collectSrcFiles(SRC_ROOT);
  const checked = files
    .filter((file) => !INTENTIONAL_SIDE_EFFECT_FILES.has(toSrcRelative(file)))
    .map((file): [string, string] => [toSrcRelative(file), file]);

  it.each(checked)('%s contains only declarative top-level statements', (_rel, absolutePath) => {
    const offenders = findTopLevelSideEffects(absolutePath);
    const formatted = offenders.map((o) => `  line ${o.line}: ${o.kind} — ${o.snippet}`).join('\n');
    expect(offenders, `Found non-declarative top-level statements:\n${formatted}`).toEqual([]);
  });

  it('intentional side-effect files have matching entries in package.json sideEffects', () => {
    const packageJsonText = readFileSync(PACKAGE_JSON_PATH, 'utf8');
    const parsed: unknown = JSON.parse(packageJsonText);
    const listed = extractSideEffectsArray(parsed);
    const missing: string[] = [];
    for (const srcPath of INTENTIONAL_SIDE_EFFECT_FILES) {
      const expectedCompiled = `./dist/esm/${srcPath.replace(/\.ts$/, '.js')}`;
      if (!listed.has(expectedCompiled)) missing.push(expectedCompiled);
    }
    expect(missing, 'Missing from package.json sideEffects:\n  ' + missing.join('\n  ')).toEqual([]);
  });
});

// region | Helpers

function toSrcRelative(absolutePath: string): string {
  return relative(SRC_ROOT, absolutePath).split('\\').join('/');
}

function collectSrcFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSrcFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function findTopLevelSideEffects(absolutePath: string): Offender[] {
  const text = readFileSync(absolutePath, 'utf8');
  const source = ts.createSourceFile(absolutePath, text, ts.ScriptTarget.Latest, true);
  const offenders: Offender[] = [];
  for (const statement of source.statements) {
    if (DECLARATIVE_KINDS.has(statement.kind)) continue;
    const start = statement.getStart(source);
    const line = source.getLineAndCharacterOfPosition(start).line + 1;
    const fullText = statement.getText(source);
    const firstLineRaw = fullText.split('\n')[0] ?? '';
    const snippet = firstLineRaw.length > 100 ? `${firstLineRaw.slice(0, 97)}...` : firstLineRaw;
    offenders.push({ line, kind: ts.SyntaxKind[statement.kind], snippet });
  }
  return offenders;
}

function extractSideEffectsArray(parsed: unknown): Set<string> {
  if (!isRecord(parsed)) return new Set();
  const value = parsed.sideEffects;
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((entry): entry is string => typeof entry === 'string'));
}

// endregion | Helpers
