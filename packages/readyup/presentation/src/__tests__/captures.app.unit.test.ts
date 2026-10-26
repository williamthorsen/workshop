import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { stripEscapes } from '../../../src/layout/test-utils/stripEscapes.ts';
import { CAPTURED_PREFLIGHT, type KitModel } from '../kits.ts';
import { type Environment, type RenderedKit, renderKit } from '../renderKit.ts';
import { CAPTURED_KITS } from './fixtures/capturedKits.ts';

vi.mock('../../../src/version.ts', async () => ({
  VERSION: (await import('../kits.ts')).CAPTURED_READYUP_VERSION,
}));

const capturesDir = path.join(import.meta.dirname, '..', '..', 'captures');

/** Matches the duration that ends a check line or a count line. */
const DURATION_SUFFIX = / \(\d+ms\)$/u;

/** Captures whose page models the whole kit, so that the page prints exactly what rdy printed. */
const COMPLETE_CAPTURES: Array<[file: string, kit: KitModel, off: string[]]> = [
  ['preflight-00.txt', CAPTURED_PREFLIGHT, ['docker', 'api']],
  ['preflight-01.txt', CAPTURED_PREFLIGHT, ['docker']],
  ['preflight-10.txt', CAPTURED_PREFLIGHT, ['api']],
  ['preflight-11.txt', CAPTURED_PREFLIGHT, []],
  ['adoption-default.txt', CAPTURED_KITS.adoption, ['narrow']],
];

/** Captures whose page models part of the kit, so that its lines appear in the capture in order among others. */
const PARTIAL_CAPTURES: Array<[file: string, kit: KitModel, off: string[]]> = [
  ['drift-default.txt', CAPTURED_KITS.drift, []],
  ['drift-drifted.txt', CAPTURED_KITS.drift, ['publish', 'sync']],
  ['onboard-default.txt', CAPTURED_KITS.onboard, ['gitconfig']],
];

describe('the deck against the captures', () => {
  it.each(COMPLETE_CAPTURES)('%s matches line for line', (file, kit, off) => {
    const rendered = renderKit(kit, buildEnvironment(kit, off));

    expect(listPrintedLines(rendered)).toStrictEqual(readCaptureLines(file));
  });

  it.each(PARTIAL_CAPTURES)('%s contains every check line in order', (file, kit, off) => {
    const rendered = renderKit(kit, buildEnvironment(kit, off));
    // A partial model's tallies, summary table, and verdict describe fewer checks than the capture's.
    const checkLines = listPrintedLines(rendered, rendered.exitAt).filter(
      (line) => line !== '' && !line.includes('Total:'),
    );

    expect(findMissingLines(checkLines, readCaptureLines(file))).toStrictEqual([]);
  });

  it('preflight-11.json matches as parsed JSON', () => {
    const rendered = renderKit(CAPTURED_PREFLIGHT, buildEnvironment(CAPTURED_PREFLIGHT, []));

    expect(zeroDurations(JSON.parse(rendered.json))).toStrictEqual(
      zeroDurations(JSON.parse(readFileSync(path.join(capturesDir, 'preflight-11.json'), 'utf8'))),
    );
  });
});

// region | Helpers

/** Returns the environment in which every condition of `kit` is on except those named in `off`. */
function buildEnvironment(kit: KitModel, off: string[]): Environment {
  return Object.fromEntries(kit.conditions.map(({ id }) => [id, !off.includes(id)]));
}

/** Returns the lines of `expected` not found in `captured`, each searched for after the match of the one before it. */
function findMissingLines(expected: string[], captured: string[]): string[] {
  const missing: string[] = [];
  let position = 0;
  for (const line of expected) {
    const index = captured.indexOf(line, position);
    if (index === -1) missing.push(line);
    else position = index + 1;
  }
  return missing;
}

/** Returns the lines that rdy printed, without colour or durations, stopping before step `beforeStep` when given. */
function listPrintedLines(rendered: RenderedKit, beforeStep = Infinity): string[] {
  return rendered.lines.filter(({ at, printed }) => printed && at < beforeStep).map(({ text }) => normalizeLine(text));
}

/** Returns a line without its escape sequences and its closing duration. */
function normalizeLine(line: string): string {
  return stripEscapes(line).replace(DURATION_SUFFIX, '');
}

/** Returns a capture's lines, without durations. */
function readCaptureLines(file: string): string[] {
  return readFileSync(path.join(capturesDir, file), 'utf8').trimEnd().split('\n').map(normalizeLine);
}

/** Returns parsed JSON with every `durationMs` set to 0. */
function zeroDurations(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(zeroDurations);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => [key, key === 'durationMs' ? 0 : zeroDurations(field)]),
  );
}

// endregion | Helpers
