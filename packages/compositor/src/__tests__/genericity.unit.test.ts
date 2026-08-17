import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ApplyOutcome } from '../apply/ApplyOutcome.ts';
import { applyPlan } from '../apply/applyPlan.ts';
import { composePlan } from '../plan/composePlan.ts';
import { readDirNames } from '../portable/readDirNames.ts';
import {
  captureGenericityComposition,
  CONTRACT_HOST_PATH,
  RATES_PDF_BYTES,
  REGION_MARKERS,
} from '../test-utils/genericity-fixture.ts';

const EXHIBIT_ENTRY = 'exhibits/schedule-of-fees/EXHIBIT.adoc';
const INDEMNITY = 'articles/clause-indemnity.adoc';

describe('a second consumer', () => {
  it('expands a directive written behind a line comment, the close no fixture beside this one exercises', async () => {
    const { targetRoot } = await composeAndApply();

    await expect(readFile(path.join(targetRoot, INDEMNITY), 'utf8')).resolves.toContain(
      'NOTE: This clause is a standard-form provision.',
    );
  });

  it('renders a referent token behind its own delimiter as the name the artifact deploys under', async () => {
    const { targetRoot } = await composeAndApply();

    await expect(readFile(path.join(targetRoot, CONTRACT_HOST_PATH), 'utf8')).resolves.toContain(
      '§clause-governing-law',
    );
  });

  it('renders a mapping token behind its own delimiter as the name the target maps it to', async () => {
    const { targetRoot } = await composeAndApply();

    const body = await readFile(path.join(targetRoot, INDEMNITY), 'utf8');

    expect(body).toContain('The Supplier shall indemnify');
    expect(body).not.toContain('Vendor');
  });

  it('rewrites a link written in its own grammar to the path its target deploys at', async () => {
    const { targetRoot } = await composeAndApply();

    await expect(readFile(path.join(targetRoot, INDEMNITY), 'utf8')).resolves.toContain(
      `xref:${targetRoot}/${EXHIBIT_ENTRY}[the fee schedule]`,
    );
  });

  it('deploys a kind under the target’s layout and name template, never the layout its source holds it in', async () => {
    const { outcome, targetRoot } = await composeAndApply();

    expect(outcome.files.map(({ path: filePath }) => filePath)).toContain(INDEMNITY);
    await expect(readDirNames(targetRoot)).resolves.not.toContain('clauses');
  });

  it('aggregates a routed kind into its host behind its own markers', async () => {
    const { targetRoot } = await composeAndApply();

    const host = await readFile(path.join(targetRoot, CONTRACT_HOST_PATH), 'utf8');

    expect(host).toContain(REGION_MARKERS.open);
    expect(host).toContain('// tag::definition:affiliate[]');
    expect(host).toContain('Affiliate: any entity controlling the Supplier');
  });

  it('copies an asset an artifact ships beside its entry file, byte for byte', async () => {
    const { targetRoot } = await composeAndApply();

    const copied = await readFile(path.join(targetRoot, 'exhibits/schedule-of-fees/rates.pdf'));

    expect(Uint8Array.from(copied)).toStrictEqual(RATES_PDF_BYTES);
  });

  it('reaches an artifact no tier named, through a referent token behind its own delimiter', async () => {
    const { outcome, targetRoot } = await composeAndApply();

    expect(outcome.files.map(({ path: filePath }) => filePath)).toContain('articles/clause-governing-law.adoc');
    await expect(readFile(path.join(targetRoot, 'articles/clause-governing-law.adoc'), 'utf8')).resolves.toContain(
      '= Governing law',
    );
  });

  it('fills an inlay declared in its own directive syntax, behind its own markers and under its own reshape', async () => {
    const { targetRoot } = await composeAndApply();

    await expect(readFile(path.join(targetRoot, INDEMNITY), 'utf8')).resolves.toContain(
      [
        '// inlay::standard-terms[]',
        '// fill::clause:standard-terms[]',
        '== Standard terms',
        '',
        'The stated schedule of fees applies.',
        '// end-fill::clause:standard-terms[]',
        '// end-inlay::standard-terms[]',
      ].join('\n'),
    );
  });

  it('reaches a clause no tier selected, through the binding that fills an inlay with it', async () => {
    const { outcome } = await composeAndApply();

    expect(outcome.files.map(({ path: filePath }) => filePath)).toContain('articles/clause-standard-terms.adoc');
  });

  it('finds nothing to do the second time, the destination already holding what was planned', async () => {
    const { config, snapshot, targetRoot } = await captureGenericityComposition();
    const plan = composePlan(config, snapshot);

    await applyPlan(plan, { baseDir: targetRoot });
    const second = await applyPlan(plan, { baseDir: targetRoot });

    expect(second.files.map(({ action }) => action)).toStrictEqual(second.files.map(() => 'unchanged'));
  });
});

// region | Helpers

/** Composes the fixture’s plan and applies it, returning the outcome beside the root it was written into. */
async function composeAndApply(): Promise<{ outcome: ApplyOutcome; targetRoot: string }> {
  const { config, snapshot, targetRoot } = await captureGenericityComposition();
  const outcome = await applyPlan(composePlan(config, snapshot), { baseDir: targetRoot });

  return { outcome, targetRoot };
}

// endregion | Helpers
