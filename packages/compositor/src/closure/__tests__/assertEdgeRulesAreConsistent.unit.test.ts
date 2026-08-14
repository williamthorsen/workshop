import { captureError } from '@williamthorsen/toolbelt.testing/candidate';
import { describe, expect, it } from 'vitest';

import type { Violation } from '../../consistency/Violation.ts';
import type { KindDescriptor } from '../../schemas/descriptor-schemas.ts';
import type { EdgeRule, KindKeys } from '../../schemas/edge-rule-schemas.ts';
import { assertEdgeRulesAreConsistent, EdgeRuleConsistencyError } from '../assertEdgeRulesAreConsistent.ts';

const kinds: ReadonlyArray<KindDescriptor> = [
  { id: 'collection', label: 'Collection', emitsFiles: false },
  { id: 'skill', label: 'Skill', emitsFiles: true },
  { id: 'subagent', label: 'Subagent', emitsFiles: true },
];

const kindKeys: KindKeys = { collections: 'collection', skills: 'skill', subagents: 'subagent' };

const declared: EdgeRule = { kindId: 'skill', key: 'dependencies', via: 'declared', form: 'kind-keyed' };
const injected: EdgeRule = { kindId: 'subagent', key: 'skills', via: 'injected', form: 'flat', targetKindId: 'skill' };

describe(assertEdgeRulesAreConsistent, () => {
  it('accepts rules whose kinds are all ones the catalog carries', () => {
    expect(() => assertEdgeRulesAreConsistent([declared, injected], kindKeys, kinds)).not.toThrow();
  });

  it('accepts no rules at all, which is a consumer whose artifacts declare no edges', () => {
    expect(() => assertEdgeRulesAreConsistent([], {}, kinds)).not.toThrow();
  });

  it('if a rule is keyed to a kind no descriptor carries, faults it, no artifact being read for it', async () => {
    await expect(violationsOf([{ ...declared, kindId: 'rulebook' }])).resolves.toStrictEqual([
      { path: 'rules[0].kindId', message: 'references "rulebook", which is not an entry in kinds' },
    ]);
  });

  it('if a flat rule targets a kind no descriptor carries, faults it', async () => {
    await expect(violationsOf([{ ...injected, targetKindId: 'rulebook' }])).resolves.toStrictEqual([
      { path: 'rules[0].targetKindId', message: 'references "rulebook", which is not an entry in kinds' },
    ]);
  });

  it('if two rules claim one key of one kind, faults the repeat, whichever loses never being read', async () => {
    await expect(violationsOf([declared, { ...declared, via: 'member' }])).resolves.toStrictEqual([
      { path: 'rules', message: 'claim "dependencies" of kind "skill" more than once' },
    ]);
  });

  it('reports a key claimed three times once, the fault being the claim rather than each repeat', async () => {
    await expect(
      violationsOf([declared, { ...declared, via: 'member' }, { ...declared, via: 'injected' }]),
    ).resolves.toHaveLength(1);
  });

  it('accepts one key claimed by two kinds, a key belonging to the kind that declares it', () => {
    const shared: EdgeRule = { ...declared, kindId: 'subagent' };

    expect(() => assertEdgeRulesAreConsistent([declared, shared], kindKeys, kinds)).not.toThrow();
  });

  it('if a declaration key names a kind no descriptor carries, faults it', async () => {
    await expect(violationsOf([declared], { rulebooks: 'rulebook' })).resolves.toStrictEqual([
      { path: 'kindKeys.rulebooks', message: 'references "rulebook", which is not an entry in kinds' },
    ]);
  });

  it('reports every fault in one run', async () => {
    const dangling: EdgeRule = { ...injected, targetKindId: 'rulebook' };

    expect((await violationsOf([declared, declared, dangling])).map(({ path }) => path)).toStrictEqual([
      'rules',
      'rules[2].targetKindId',
    ]);
  });
});

// region | Helpers

/** Runs the assertion and returns the violations it raised, failing the test when it raised none. */
async function violationsOf(
  rules: ReadonlyArray<EdgeRule>,
  keys: KindKeys = kindKeys,
): Promise<ReadonlyArray<Violation>> {
  return (await captureError(EdgeRuleConsistencyError, () => assertEdgeRulesAreConsistent(rules, keys, kinds)))
    .violations;
}

// endregion | Helpers
