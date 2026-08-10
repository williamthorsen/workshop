import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { richFormatter } from '../layout/richFormatter.ts';
import { printStep, reportWriteResult } from '../terminal.ts';
import type { WriteResult } from '../writeFileWithCheck.ts';

const PASSED = richFormatter.tokens.passed.glyph;
const SKIPPED = richFormatter.tokens.skippedOptional.glyph;
const WARNED = richFormatter.tokens.failedWarn.glyph;
const FAILED = richFormatter.tokens.failedError.glyph;

const PATH = '.config/readyup.config.ts';

function makeResult(overrides: Partial<WriteResult> = {}): WriteResult {
  return { filePath: PATH, outcome: 'created', ...overrides };
}

describe(printStep, () => {
  let infoSpy: MockInstance;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a step label as a section heading, parted from what precedes it', () => {
    printStep('Scaffolding config');

    expect(infoSpy).toHaveBeenCalledWith('\n\u{2500}\u{2500} Scaffolding config');
  });

  it('retires the arrow-prefixed step grammar', () => {
    printStep('Next steps');

    expect(infoSpy).not.toHaveBeenCalledWith(expect.stringContaining('> Next steps'));
  });
});

describe(reportWriteResult, () => {
  let infoSpy: MockInstance;
  let errorSpy: MockInstance;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe.each([
    ['created', { outcome: 'created' as const }, `${PASSED} ${PATH} \u{00B7} created`],
    ['overwrote', { outcome: 'overwritten' as const }, `${PASSED} ${PATH} \u{00B7} overwrote`],
    ['up to date', { outcome: 'up-to-date' as const }, `${PASSED} ${PATH} \u{00B7} up to date`],
    ['already exists', { outcome: 'skipped' as const }, `${SKIPPED} ${PATH} \u{00B7} already exists`],
  ])('%s', (_case, overrides, expected) => {
    it('renders the ratified token with the outcome as inline detail', () => {
      reportWriteResult(makeResult(overrides), false);

      expect(infoSpy).toHaveBeenCalledWith(expected);
    });

    it('writes to stdout', () => {
      reportWriteResult(makeResult(overrides), false);

      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe.each([
    ['created', { outcome: 'created' as const }, 'would create'],
    ['overwritten', { outcome: 'overwritten' as const }, 'would overwrite'],
  ])('%s under dry run', (_case, overrides, expected) => {
    it('states what would happen rather than what did', () => {
      reportWriteResult(makeResult(overrides), true);

      expect(infoSpy).toHaveBeenCalledWith(`${PASSED} ${PATH} \u{00B7} ${expected}`);
    });
  });

  describe('unreadable for comparison', () => {
    const result = makeResult({ outcome: 'skipped', error: 'EACCES' });

    it('warns rather than reporting a benign skip', () => {
      reportWriteResult(result, false);

      expect(infoSpy).toHaveBeenCalledWith(`${WARNED} ${PATH}\n   could not read for comparison: EACCES`);
    });

    it('puts the reason in a block rather than inline', () => {
      reportWriteResult(result, false);

      expect(infoSpy).not.toHaveBeenCalledWith(expect.stringContaining(`${PATH} \u{00B7}`));
    });
  });

  describe('failed', () => {
    it('renders a claim with the cause in a block beneath', () => {
      reportWriteResult(makeResult({ outcome: 'failed', error: 'ENOSPC' }), false);

      expect(errorSpy).toHaveBeenCalledWith(`${FAILED} ${PATH}\n   failed to write: ENOSPC`);
    });

    it('states the failure without a cause when none was captured', () => {
      reportWriteResult(makeResult({ outcome: 'failed' }), false);

      expect(errorSpy).toHaveBeenCalledWith(`${FAILED} ${PATH}\n   failed to write`);
    });

    it('routes to stderr so a caller redirecting stdout still sees it', () => {
      reportWriteResult(makeResult({ outcome: 'failed', error: 'ENOSPC' }), false);

      expect(infoSpy).not.toHaveBeenCalled();
    });
  });

  it.each(['\u{2705}', '\u{26A0}', '\u{274C}', '\u{FE0F}'])('renders no %s for any outcome', (retired) => {
    const outcomes: WriteResult[] = [
      makeResult({ outcome: 'created' }),
      makeResult({ outcome: 'overwritten' }),
      makeResult({ outcome: 'up-to-date' }),
      makeResult({ outcome: 'skipped' }),
      makeResult({ outcome: 'skipped', error: 'EACCES' }),
      makeResult({ outcome: 'failed', error: 'ENOSPC' }),
    ];

    for (const result of outcomes) {
      reportWriteResult(result, false);
    }

    const written = [...infoSpy.mock.calls, ...errorSpy.mock.calls].flat().join('\n');
    expect(written).not.toContain(retired);
  });
});
