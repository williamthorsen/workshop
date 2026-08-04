import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { EdgeRuleSchema, KindKeysSchema } from '../edge-rule-schemas.ts';
import { findIssuePaths } from '../test-utils/findIssuePaths.ts';

const kindKeyed = { kindId: 'skill', key: 'dependencies', via: 'declared', form: 'kind-keyed' };
const flat = { kindId: 'subagent', key: 'skills', via: 'injected', form: 'flat', targetKindId: 'skill' };
const aggregate = {
  kindId: 'collection',
  key: 'members',
  via: 'member',
  form: 'kind-keyed',
  wildcard: { token: '@library', via: 'enumerated' },
};

describe('EdgeRuleSchema', () => {
  it('accepts a key holding a mapping of declaration key to slug list', () => {
    expect(EdgeRuleSchema.parse(kindKeyed)).toStrictEqual(kindKeyed);
  });

  it('accepts a key holding a bare list of slugs naming one kind', () => {
    expect(EdgeRuleSchema.parse(flat)).toStrictEqual(flat);
  });

  it('accepts a wildcard on the kind-keyed form, recording the origin its expansion carries', () => {
    expect(EdgeRuleSchema.parse(aggregate)).toStrictEqual(aggregate);
  });

  it('if a flat rule names no target kind, rejects it for that field, its slugs naming nothing otherwise', () => {
    const { targetKindId: _dropped, ...incomplete } = flat;

    expect(findIssuePaths(EdgeRuleSchema, incomplete)).toStrictEqual([['targetKindId']]);
  });

  it('strips a wildcard from the flat form, which declares none', () => {
    const parsed = EdgeRuleSchema.parse({ ...flat, wildcard: { token: '@library', via: 'enumerated' } });

    expect(parsed).not.toHaveProperty('wildcard');
  });

  // A token edge is contributed by a body, so no key can declare one and claim it arrived that way.
  it('rejects a rule claiming the token origin, which no frontmatter key can produce', () => {
    expect(findIssuePaths(EdgeRuleSchema, { ...kindKeyed, via: 'token' })).toStrictEqual([['via']]);
  });

  it('rejects a wildcard claiming the token origin, for the same reason', () => {
    const claimed = { ...aggregate, wildcard: { token: '@library', via: 'token' } };

    expect(findIssuePaths(EdgeRuleSchema, claimed)).toStrictEqual([['wildcard', 'via']]);
  });

  it('renders both forms to JSON Schema, so a published document describes what this package accepts', () => {
    expect(z.toJSONSchema(EdgeRuleSchema).$defs).toHaveProperty(['KindKeyedEdgeRule']);
    expect(z.toJSONSchema(EdgeRuleSchema).$defs).toHaveProperty(['FlatEdgeRule']);
  });
});

describe('KindKeysSchema', () => {
  it('accepts the declaration keys a kind-keyed block is written in', () => {
    expect(KindKeysSchema.parse({ skills: 'skill', subagents: 'subagent' })).toStrictEqual({
      skills: 'skill',
      subagents: 'subagent',
    });
  });

  it('accepts no keys at all, which is a consumer whose kinds declare no kind-keyed block', () => {
    expect(KindKeysSchema.parse({})).toStrictEqual({});
  });

  it('if a key names an empty kind, rejects it for that key', () => {
    expect(findIssuePaths(KindKeysSchema, { skills: '' })).toStrictEqual([['skills']]);
  });
});
