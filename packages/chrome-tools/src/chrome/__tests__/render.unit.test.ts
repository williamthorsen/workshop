import { describe, expect, it } from 'vitest';

import { ThorChromeRefusal } from '../invocation.ts';
import {
  describeProfileCount,
  describeProvenance,
  formatCommandLine,
  renderRefusal,
  stringifyJson,
} from '../render.ts';
import { makeFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';

const UNRECORDED = {
  branch: undefined,
  lastUsed: undefined,
  origin: undefined,
  repo: undefined,
  repoDir: undefined,
  stale: undefined,
};

describe(stringifyJson, () => {
  it('escapes control characters as the bash renderer did', () => {
    expect(stringifyJson({ value: 'a\nb\rc\td\be\ff\u{1}"\\' })).toBe(
      String.raw`{"value":"a\nb\rc\td\u0008e\u000cf\u0001\"\\"}`,
    );
  });

  it('leaves a literal backslash followed by b or f alone', () => {
    expect(stringifyJson(String.raw`\b\f`)).toBe(String.raw`"\\b\\f"`);
  });
});

describe(describeProfileCount, () => {
  it('names one profile in the singular', () => {
    expect(describeProfileCount(1)).toBe('1 profile');
    expect(describeProfileCount(0)).toBe('0 profiles');
  });
});

describe(describeProvenance, () => {
  it('marks a profile without a record as unrecorded, and a live one with nothing', () => {
    expect(describeProvenance(UNRECORDED)).toBe(', unrecorded');
    expect(describeProvenance({ ...UNRECORDED, origin: 'derived', stale: false })).toBe('');
  });

  it('names the branch when the repository remains, and the repository otherwise', () => {
    const fake = makeFakeThorChrome();
    const stale = { ...UNRECORDED, branch: '9', origin: 'derived', stale: true };
    expect(describeProvenance({ ...stale, repoDir: fake.home })).toBe(", stale: branch '9' is gone");
    expect(describeProvenance({ ...stale, repoDir: `${fake.home}/gone` })).toBe(
      `, stale: repository ${fake.home}/gone is gone`,
    );
  });
});

describe(formatCommandLine, () => {
  it('quotes each argument as bash does', () => {
    expect(formatCommandLine(['/a b/chrome', '--window-name=x · :1', 'http://h/?a=1&b=2'])).toBe(
      String.raw`/a\ b/chrome --window-name=x\ ·\ :1 http://h/\?a=1\&b=2`,
    );
  });
});

describe(renderRefusal, () => {
  it('prints the headline and indented hints on stderr', () => {
    const fake = makeFakeThorChrome();
    const refusal = new ThorChromeRefusal('port-busy', 'port 1 is held', undefined, { hints: ['Pick another'] });
    expect(renderRefusal(fake.makeInvocation(), refusal)).toBe(1);
    expect(fake.captured.stderr()).toBe('thor-chrome: port 1 is held\n  Pick another\n');
  });

  it('folds the extra fields into the error and reports the profile beside it under --json', () => {
    const fake = makeFakeThorChrome();
    const profile = { dir: `${fake.profilesDir}/thrive`, name: 'thrive' };
    const refusal = new ThorChromeRefusal('port-busy', 'held', profile, { extra: { listener: 'node' }, status: 3 });
    expect(renderRefusal(fake.makeInvocation('json'), refusal)).toBe(3);
    expect(fake.readReport()).toMatchObject({
      error: { code: 'port-busy', listener: 'node', message: 'held' },
      profile: { name: 'thrive', state: 'stopped' },
    });
    expect(fake.captured.stderr()).toBe('');
  });
});
