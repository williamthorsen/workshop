import { describe, expect, it } from 'vitest';

import { ThorChromeRefusal } from '../invocation.ts';
import { renderProfileJson, renderRefusalJson, renderResultJson } from '../render-json.ts';
import { makeProfileEntry } from '../test-utils/profile-entry.ts';

describe(renderProfileJson, () => {
  it('reports every field in a fixed order, with the endpoint and the mode of a debugging browser', () => {
    const entry = makeProfileEntry(
      { isHeadless: true, pid: '11', port: '9333', state: 'debugging' },
      { branch: '321', lastUsed: 1_767_355_200, origin: 'derived', repo: 'widget', repoDir: '/w', stale: false },
    );
    expect(JSON.stringify(renderProfileJson(entry))).toBe(
      '{"name":"thrive","path":"/p/thrive","state":"debugging","headless":true,"pid":11,"port":9333,' +
        '"derivedPort":20321,"devtools":"http://127.0.0.1:9333/json/version","origin":"derived","repo":"widget",' +
        '"branch":"321","stale":false,"lastUsedAt":"2026-01-02T12:00:00Z"}',
    );
  });

  it('reports no mode and no endpoint for a profile without a running browser', () => {
    const rendered = renderProfileJson(makeProfileEntry({ isHeadless: true, pid: '11', state: 'stopped' }));
    expect(rendered).toMatchObject({ headless: null, devtools: null, pid: 11 });
  });
});

describe(renderResultJson, () => {
  it("adds a retained profile's reason and a refused profile's error after its fields", () => {
    const retained = makeProfileEntry({ name: 'atlas', state: 'running-without-port' });
    const refused = makeProfileEntry();
    const error = { code: 'quit-failed', message: 'could not signal' };
    const rendered = renderResultJson({
      isDryRun: true,
      missingDerivedDir: undefined,
      outcomes: [
        { entry: retained, type: 'retained' },
        { entry: refused, error, hints: ['ignored'], type: 'refused' },
      ],
      profilesDir: '/p',
      selection: 'all',
      type: 'delete',
    });
    expect(rendered).toStrictEqual({
      profiles: [
        { ...renderProfileJson(retained), retained: 'running' },
        { ...renderProfileJson(refused), error },
      ],
      dryRun: true,
    });
    expect(Object.keys(rendered ?? {})).toStrictEqual(['profiles', 'dryRun']);
  });

  it('reports a dry-run launch against a running profile with a null command', () => {
    expect(
      renderResultJson({ command: undefined, pages: [], port: '9333', profile: 'thrive', type: 'launch-plan' }),
    ).toStrictEqual({ command: null, pages: [], dryRun: true });
  });

  it('reports a missing profiles directory as an empty list', () => {
    expect(renderResultJson({ entries: undefined, isStaleOnly: false, profilesDir: '/p', type: 'list' })).toStrictEqual(
      { profiles: [] },
    );
  });
});

describe(renderRefusalJson, () => {
  it('folds the extra fields into the error and reports the profile beside it', () => {
    const refusal = new ThorChromeRefusal('launch-timeout', 'nothing answers', undefined, { extra: { log: '/l' } });
    const entry = makeProfileEntry();
    expect(renderRefusalJson(refusal, entry)).toStrictEqual({
      error: { code: 'launch-timeout', message: 'nothing answers', log: '/l' },
      profile: renderProfileJson(entry),
    });
    expect(renderRefusalJson(refusal, undefined)).toStrictEqual({
      error: { code: 'launch-timeout', message: 'nothing answers', log: '/l' },
    });
  });
});
