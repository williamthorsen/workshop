import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { findChromeForTesting, resolveBrowserName } from '../browser.ts';
import { makeFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';

describe(findChromeForTesting, () => {
  it('returns the executable of the highest installed revision', () => {
    const fake = makeFakeThorChrome();
    const root = `${fake.home}/pw`;
    fake.env['PLAYWRIGHT_BROWSERS_PATH'] = root;
    for (const revision of ['990', '1217']) {
      const dir = `${root}/chromium-${revision}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS`;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(`${dir}/Google Chrome for Testing`, '', { mode: 0o755 });
    }
    fs.mkdirSync(`${root}/chromium-9999`);
    fs.mkdirSync(`${root}/chromium-headless-1300`);
    expect(findChromeForTesting(fake.makeInvocation())).toBe(
      `${root}/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
    );
  });

  it('returns undefined when none is installed, looking under the home directory by default', () => {
    const fake = makeFakeThorChrome();
    expect(findChromeForTesting(fake.makeInvocation())).toBeUndefined();
  });
});

describe(resolveBrowserName, () => {
  it.each([
    ['chrome when the variable is unset', undefined, undefined, 'chrome'],
    ['chrome when the variable is empty', '', undefined, 'chrome'],
    ['the browser that the variable names', 'chrome-for-testing', undefined, 'chrome-for-testing'],
    ['the flag over the variable', 'chrome-for-testing', 'chrome', 'chrome'],
  ])('returns %s', (_description, variable, flag, expected) => {
    const fake = makeFakeThorChrome({ env: { THOR_CHROME_BROWSER: variable } });
    expect(resolveBrowserName(fake.makeInvocation(), flag)).toBe(expected);
  });

  it('refuses an unknown name, naming the variable only when the name came from it', () => {
    const fake = makeFakeThorChrome({ env: { THOR_CHROME_BROWSER: 'safari' } });
    expect(() => resolveBrowserName(fake.makeInvocation(), undefined)).toThrow(
      "unknown browser 'safari' in THOR_CHROME_BROWSER (chrome, chrome-for-testing)",
    );
    expect(() => resolveBrowserName(fake.makeInvocation(), 'opera')).toThrow(
      "unknown browser 'opera' (chrome, chrome-for-testing)",
    );
  });
});
