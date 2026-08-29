import { describe, expect, it } from 'vitest';

import type { RdyManifestKit } from '../../manifest/manifestSchema.ts';
import { resolveRemedies } from '../remedies.ts';
import type { KitVerdicts } from '../verdicts.ts';

const KIT: RdyManifestKit = { name: 'deploy', path: 'kits/deploy.js', source: 'kits/deploy.ts' };

const RECOMPILE = 'Run `rdy compile` to rebuild it.';
const MOVE_EDITS = 'Move the edits into the source, then run `rdy compile --force`.';
const RE_RECORD =
  'The bundle reproduces, so its recorded hash is what is stale. Run `rdy compile --force` to re-record it.';

describe(resolveRemedies, () => {
  it('names no remedy for a kit whose every verdict is ok', () => {
    const verdicts = buildVerdicts({
      drift: { kind: 'ok', targetHash: 'abc' },
      inputs: { kind: 'ok' },
      source: { kind: 'ok', sourceHash: 'def' },
    });

    expect(resolveRemedies(KIT, verdicts)).toStrictEqual([]);
  });

  it('names no remedy for a kit whose only non-ok verdicts are unverified', () => {
    expect(resolveRemedies(KIT, buildVerdicts())).toStrictEqual([]);
  });

  describe('compiled-output verdict', () => {
    it('sends a drifted bundle back through the source, because compile skips a drifted kit', () => {
      expect(resolveRemedies(KIT, buildVerdicts({ drift: buildDrift() }))).toStrictEqual([MOVE_EDITS]);
    });

    it('names re-recording instead where the rebuild reproduces the drifted bundle', () => {
      const verdicts = buildVerdicts({ drift: buildDrift(), rebuild: { kind: 'ok' } });

      expect(resolveRemedies(KIT, verdicts)).toStrictEqual([RE_RECORD]);
    });

    it('names only the move-edits remedy where the rebuild also fails, whose recompile the drift gate refuses', () => {
      const rebuild = { kind: 'mismatch', expected: 'aaa', actual: 'bbb' } as const;

      expect(resolveRemedies(KIT, buildVerdicts({ drift: buildDrift(), rebuild }))).toStrictEqual([MOVE_EDITS]);
    });

    it('recompiles a bundle that is gone, which no drift gate stands in the way of', () => {
      const drift = { kind: 'missing', resolvedPath: '/repo/kits/deploy.js' } as const;

      expect(resolveRemedies(KIT, buildVerdicts({ drift }))).toStrictEqual([RECOMPILE]);
    });
  });

  describe('source verdict', () => {
    it('recompiles a source that has moved on', () => {
      const source = { kind: 'stale', expected: 'aaa', actual: 'bbb', resolvedPath: '/repo/kits/deploy.ts' } as const;

      expect(resolveRemedies(KIT, buildVerdicts({ source }))).toStrictEqual([RECOMPILE]);
    });

    it('names the vanished source, offering a recompile as the way to drop the kit', () => {
      expect(resolveRemedies(KIT, buildVerdicts({ source: buildMissingSource() }))).toStrictEqual([
        'Restore kits/deploy.ts, or run `rdy compile` to drop the kit from the manifest.',
      ]);
    });

    it('falls back to a recompile where the entry records no source to name', () => {
      const kit: RdyManifestKit = { name: 'deploy', path: 'kits/deploy.js' };

      expect(resolveRemedies(kit, buildVerdicts({ source: buildMissingSource() }))).toStrictEqual([RECOMPILE]);
    });
  });

  describe('inputs verdict', () => {
    it('recompiles a kit whose recorded input has changed', () => {
      const inputs = buildStaleInputs([
        { kind: 'module', path: 'checks/shared.ts', reason: 'changed', expected: 'aaa', actual: 'bbb' },
      ]);

      expect(resolveRemedies(KIT, buildVerdicts({ inputs }))).toStrictEqual([RECOMPILE]);
    });

    it('names an input that is gone, offering a recompile where the kit no longer reads it', () => {
      const inputs = buildStaleInputs([{ kind: 'module', path: 'checks/shared.ts', reason: 'missing' }]);

      expect(resolveRemedies(KIT, buildVerdicts({ inputs }))).toStrictEqual([
        'Restore checks/shared.ts, or run `rdy compile` if the kit no longer reads it.',
      ]);
    });

    it('sends an unprojectable input to the picked fields rather than to a recompile', () => {
      const inputs = buildStaleInputs([
        { kind: 'inline', path: '../../package.json', reason: 'unprojectable', detail: 'Path not found: version' },
      ]);

      expect(resolveRemedies(KIT, buildVerdicts({ inputs }))).toStrictEqual([
        "Restore the picked fields in ../../package.json, or repoint the kit's `pickJson` call.",
      ]);
    });

    it('names one remedy for several inputs that failed the same way', () => {
      const inputs = buildStaleInputs([
        { kind: 'module', path: 'checks/one.ts', reason: 'changed', expected: 'aaa', actual: 'bbb' },
        { kind: 'module', path: 'checks/two.ts', reason: 'changed', expected: 'ccc', actual: 'ddd' },
      ]);

      expect(resolveRemedies(KIT, buildVerdicts({ inputs }))).toStrictEqual([RECOMPILE]);
    });
  });

  describe('rebuild verdict', () => {
    it('recompiles a bundle the rebuild does not reproduce', () => {
      const rebuild = { kind: 'mismatch', expected: 'aaa', actual: 'bbb' } as const;

      expect(resolveRemedies(KIT, buildVerdicts({ rebuild }))).toStrictEqual([RECOMPILE]);
    });

    it('sends a source that no longer compiles back to the kit rather than to a recompile', () => {
      const rebuild = { kind: 'failed', message: 'Unexpected token' } as const;

      expect(resolveRemedies(KIT, buildVerdicts({ rebuild }))).toStrictEqual(['Fix the kit source so it compiles.']);
    });

    it('recompiles to fill in a manifest entry the rebuild found nothing recorded in', () => {
      const rebuild = { kind: 'missing', reason: 'no source recorded in manifest' } as const;

      expect(resolveRemedies(KIT, buildVerdicts({ rebuild }))).toStrictEqual([RECOMPILE]);
    });

    it('stays silent where the hash axis owning the absent file has already named it', () => {
      const rebuild = { kind: 'missing', reason: 'source file kits/deploy.ts is gone' } as const;
      const verdicts = buildVerdicts({ rebuild, source: buildMissingSource() });

      expect(resolveRemedies(KIT, verdicts)).toStrictEqual([
        'Restore kits/deploy.ts, or run `rdy compile` to drop the kit from the manifest.',
      ]);
    });
  });

  it('names a shared remedy once for a kit that reaches it on three axes', () => {
    const verdicts = buildVerdicts({
      inputs: buildStaleInputs([
        { kind: 'module', path: 'checks/shared.ts', reason: 'changed', expected: 'aaa', actual: 'bbb' },
      ]),
      rebuild: { kind: 'mismatch', expected: 'ccc', actual: 'ddd' },
      source: { kind: 'stale', expected: 'eee', actual: 'fff', resolvedPath: '/repo/kits/deploy.ts' },
    });

    expect(resolveRemedies(KIT, verdicts)).toStrictEqual([RECOMPILE]);
  });

  it('orders remedies by axis, the compiled output before the inputs', () => {
    const verdicts = buildVerdicts({
      drift: buildDrift(),
      inputs: buildStaleInputs([
        { kind: 'inline', path: '../../package.json', reason: 'unprojectable', detail: 'Path not found: version' },
      ]),
    });

    expect(resolveRemedies(KIT, verdicts)).toStrictEqual([
      MOVE_EDITS,
      "Restore the picked fields in ../../package.json, or repoint the kit's `pickJson` call.",
    ]);
  });

  describe('collapsing remedies a reader cannot act on', () => {
    it("names one remedy for a source recorded among the kit's own inputs, where both axes report it gone", () => {
      const verdicts = buildVerdicts({
        inputs: buildStaleInputs([{ kind: 'module', path: 'kits/deploy.ts', reason: 'missing' }]),
        source: buildMissingSource(),
      });

      expect(resolveRemedies(KIT, verdicts)).toStrictEqual([
        'Restore kits/deploy.ts, or run `rdy compile` to drop the kit from the manifest.',
      ]);
    });

    it('drops a bare recompile where the target has drifted, which the drift gate refuses to run', () => {
      const verdicts = buildVerdicts({
        drift: buildDrift(),
        inputs: buildStaleInputs([
          { kind: 'module', path: 'checks/shared.ts', reason: 'changed', expected: 'aaa', actual: 'bbb' },
        ]),
        source: { kind: 'stale', expected: 'eee', actual: 'fff', resolvedPath: '/repo/kits/deploy.ts' },
      });

      expect(resolveRemedies(KIT, verdicts)).toStrictEqual([MOVE_EDITS]);
    });

    it('drops a bare recompile beside the re-record remedy, which recompiles from the same source', () => {
      const verdicts = buildVerdicts({
        drift: buildDrift(),
        rebuild: { kind: 'ok' },
        source: { kind: 'stale', expected: 'eee', actual: 'fff', resolvedPath: '/repo/kits/deploy.ts' },
      });

      expect(resolveRemedies(KIT, verdicts)).toStrictEqual([RE_RECORD]);
    });

    it('keeps the bare recompile for a bundle that is merely gone, which hits no drift gate', () => {
      const verdicts = buildVerdicts({
        drift: { kind: 'missing', resolvedPath: '/repo/kits/deploy.js' },
        source: { kind: 'stale', expected: 'eee', actual: 'fff', resolvedPath: '/repo/kits/deploy.ts' },
      });

      expect(resolveRemedies(KIT, verdicts)).toStrictEqual([RECOMPILE]);
    });

    it('keeps a remedy the force recompile does not settle, such as a source that no longer compiles', () => {
      const verdicts = buildVerdicts({
        drift: buildDrift(),
        rebuild: { kind: 'failed', message: 'Unexpected token' },
      });

      expect(resolveRemedies(KIT, verdicts)).toStrictEqual([MOVE_EDITS, 'Fix the kit source so it compiles.']);
    });

    it('keeps a remedy that only offers a recompile as its second branch, whose first branch drift does not block', () => {
      const verdicts = buildVerdicts({
        drift: buildDrift(),
        inputs: buildStaleInputs([{ kind: 'module', path: 'checks/shared.ts', reason: 'missing' }]),
      });

      expect(resolveRemedies(KIT, verdicts)).toStrictEqual([
        MOVE_EDITS,
        'Restore checks/shared.ts, or run `rdy compile` if the kit no longer reads it.',
      ]);
    });
  });
});

// region | Helpers

/** Returns a drifted compiled-output verdict. */
function buildDrift(): KitVerdicts['drift'] {
  return { kind: 'drift', expected: 'aaa', actual: 'bbb', resolvedPath: '/repo/kits/deploy.js' };
}

/** Returns a source verdict reporting the recorded file as gone. */
function buildMissingSource(): KitVerdicts['source'] {
  return { kind: 'missing', resolvedPath: '/repo/kits/deploy.ts' };
}

/** Returns an inputs verdict carrying the given failures. */
function buildStaleInputs(
  failures: Extract<KitVerdicts['inputs'], { kind: 'stale' }>['failures'],
): KitVerdicts['inputs'] {
  return { kind: 'stale', failures };
}

/** Returns a verdict set that fails nothing, with `overrides` replacing whichever axes a test drives. */
function buildVerdicts(overrides: Partial<KitVerdicts> = {}): KitVerdicts {
  return {
    drift: { kind: 'unverified' },
    inputs: { kind: 'unverified' },
    rebuild: undefined,
    source: { kind: 'unverified' },
    ...overrides,
  };
}

// endregion | Helpers
