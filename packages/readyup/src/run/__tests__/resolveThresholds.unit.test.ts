import { describe, expect, it } from 'vitest';

import type { RdyKit } from '../../kits/types.ts';
import { resolveThresholds } from '../resolveThresholds.ts';

describe(resolveThresholds, () => {
  describe('failOn', () => {
    it('takes the CLI flag over what the kit declares', () => {
      expect(resolveThresholds(makeKit({ failOn: 'error' }), 'warn', undefined).failOn).toBe('warn');
    });

    it('falls back to what the kit declares when the CLI flag is absent', () => {
      expect(resolveThresholds(makeKit({ failOn: 'recommend' }), undefined, undefined).failOn).toBe('recommend');
    });

    it('falls back to error when neither declares one', () => {
      expect(resolveThresholds(makeKit(), undefined, undefined).failOn).toBe('error');
    });
  });

  describe('reportOn', () => {
    it('takes the CLI flag over what the kit declares', () => {
      expect(resolveThresholds(makeKit({ reportOn: 'error' }), undefined, 'warn').reportOn).toBe('warn');
    });

    it('falls back to what the kit declares when the CLI flag is absent', () => {
      expect(resolveThresholds(makeKit({ reportOn: 'warn' }), undefined, undefined).reportOn).toBe('warn');
    });

    it('falls back to recommend when neither declares one', () => {
      expect(resolveThresholds(makeKit(), undefined, undefined).reportOn).toBe('recommend');
    });
  });

  describe('defaultSeverity', () => {
    it('takes what the kit declares, which no CLI flag overrides', () => {
      expect(resolveThresholds(makeKit({ defaultSeverity: 'warn' }), 'error', 'error').defaultSeverity).toBe('warn');
    });

    it('falls back to error when the kit declares none', () => {
      expect(resolveThresholds(makeKit(), undefined, undefined).defaultSeverity).toBe('error');
    });
  });
});

// region | Helpers

/** Builds a minimal kit, optionally declaring thresholds of its own. */
function makeKit(overrides?: Partial<RdyKit>): RdyKit {
  return { checklists: [{ name: 'deploy', checks: [{ name: 'a', check: () => true }] }], ...overrides };
}

// endregion | Helpers
