import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it } from 'vitest';

import { richFormatter } from '../../layout/richFormatter.ts';
import type { WriteResult } from '../../portable/writeFileWithCheck.ts';
import { printStep, reportWriteResult } from '../terminal.ts';

const PASSED = richFormatter.tokens.passed.glyph;
const SKIPPED = richFormatter.tokens.skippedOptional.glyph;
const WARNED = richFormatter.tokens.failedWarn.glyph;
const FAILED = richFormatter.tokens.failedError.glyph;

const PATH = '.config/readyup.config.ts';

function makeResult(overrides: Partial<WriteResult> = {}): WriteResult {
  return { filePath: PATH, outcome: 'created', ...overrides };
}

describe(printStep, () => {
  it('renders a step label as a section heading, parted from what precedes it', () => {
    using silent = silenceConsole(['info']);

    printStep('Scaffolding config');

    expect(silent.info).toHaveBeenCalledWith('\n\u{2500}\u{2500} Scaffolding config');
  });

  it('retires the arrow-prefixed step grammar', () => {
    using silent = silenceConsole(['info']);

    printStep('Next steps');

    expect(silent.info).not.toHaveBeenCalledWith(expect.stringContaining('> Next steps'));
  });
});

describe(reportWriteResult, () => {
  describe.each([
    ['created', { outcome: 'created' as const }, `${PASSED} ${PATH} \u{00B7} created`],
    ['overwrote', { outcome: 'overwritten' as const }, `${PASSED} ${PATH} \u{00B7} overwrote`],
    ['up to date', { outcome: 'up-to-date' as const }, `${PASSED} ${PATH} \u{00B7} up to date`],
    ['already exists', { outcome: 'skipped' as const }, `${SKIPPED} ${PATH} \u{00B7} already exists`],
  ])('%s', (_case, overrides, expected) => {
    it('renders the ratified token with the outcome as inline detail', () => {
      using silent = silenceConsole(['error', 'info']);

      reportWriteResult(makeResult(overrides), false);

      expect(silent.info).toHaveBeenCalledWith(expected);
    });

    it('writes to stdout', () => {
      using silent = silenceConsole(['error', 'info']);

      reportWriteResult(makeResult(overrides), false);

      expect(silent.error).not.toHaveBeenCalled();
    });
  });

  describe.each([
    ['created', { outcome: 'created' as const }, 'would create'],
    ['overwritten', { outcome: 'overwritten' as const }, 'would overwrite'],
  ])('%s under dry run', (_case, overrides, expected) => {
    it('states what would happen rather than what did', () => {
      using silent = silenceConsole(['error', 'info']);

      reportWriteResult(makeResult(overrides), true);

      expect(silent.info).toHaveBeenCalledWith(`${PASSED} ${PATH} \u{00B7} ${expected}`);
    });
  });

  describe('unreadable for comparison', () => {
    const result = makeResult({ outcome: 'skipped', error: 'EACCES' });

    it('warns rather than reporting a benign skip', () => {
      using silent = silenceConsole(['error', 'info']);

      reportWriteResult(result, false);

      expect(silent.info).toHaveBeenCalledWith(`${WARNED} ${PATH}\n   could not read for comparison: EACCES`);
    });

    it('puts the reason in a block rather than inline', () => {
      using silent = silenceConsole(['error', 'info']);

      reportWriteResult(result, false);

      expect(silent.info).not.toHaveBeenCalledWith(expect.stringContaining(`${PATH} \u{00B7}`));
    });
  });

  describe('failed', () => {
    it('renders a claim with the cause in a block beneath', () => {
      using silent = silenceConsole(['error', 'info']);

      reportWriteResult(makeResult({ outcome: 'failed', error: 'ENOSPC' }), false);

      expect(silent.error).toHaveBeenCalledWith(`${FAILED} ${PATH}\n   failed to write: ENOSPC`);
    });

    it('states the failure without a cause when none was captured', () => {
      using silent = silenceConsole(['error', 'info']);

      reportWriteResult(makeResult({ outcome: 'failed' }), false);

      expect(silent.error).toHaveBeenCalledWith(`${FAILED} ${PATH}\n   failed to write`);
    });

    it('routes to stderr so a caller redirecting stdout still sees it', () => {
      using silent = silenceConsole(['error', 'info']);

      reportWriteResult(makeResult({ outcome: 'failed', error: 'ENOSPC' }), false);

      expect(silent.info).not.toHaveBeenCalled();
    });
  });

  it.each(['\u{2705}', '\u{26A0}', '\u{274C}', '\u{FE0F}'])('renders no %s for any outcome', (retired) => {
    using silent = silenceConsole(['error', 'info']);

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

    const written = [...silent.info.mock.calls, ...silent.error.mock.calls].flat().join('\n');
    expect(written).not.toContain(retired);
  });
});
