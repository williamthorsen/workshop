import { afterAll, describe, expect, it } from 'vitest';

import { takeClosedPort } from '../../test-utils/closed-port.ts';
import { startHeadlessChrome } from '../../test-utils/headless-chrome.ts';
import { openBackgroundPage } from '../open-background-page.ts';

// Start the browser once at collection, so that every case shares it and the skip is decided before any case runs
const browser = await startHeadlessChrome();

describe(openBackgroundPage, () => {
  afterAll(async () => {
    await browser?.stop();
  });

  it.skipIf(browser === undefined)('opens each page as a target of the browser, in call order', async () => {
    const port = browser?.port ?? '';
    await expect(openBackgroundPage(port, 'data:text/html,one')).resolves.toStrictEqual({
      isOpened: true,
      targetId: expect.any(String),
    });
    await expect(openBackgroundPage(port, 'data:text/html,two')).resolves.toStrictEqual({
      isOpened: true,
      targetId: expect.any(String),
    });

    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets: unknown = await response.json();
    expect(Array.isArray(targets)).toBe(true);
    // The browser also lists its own UI as targets of type browser_ui; /json/list puts the newest page first
    const pages = Array.isArray(targets) ? targets.filter((target) => isPageTarget(target)) : [];
    expect(pages.map((page) => page.url)).toStrictEqual(['data:text/html,two', 'data:text/html,one']);
  });

  it('reports the failure on a port where nothing answers', async () => {
    const port = String(await takeClosedPort());
    await expect(openBackgroundPage(port, 'about:blank')).resolves.toStrictEqual({
      isOpened: false,
      reason: expect.stringMatching(/^the DevTools endpoint did not answer: /),
    });
  });
});

// region | Helpers

/** Returns whether a `/json/list` entry is a page target. */
function isPageTarget(target: unknown): target is { url: string } {
  if (typeof target !== 'object' || target === null) return false;
  return 'type' in target && target.type === 'page' && 'url' in target && typeof target.url === 'string';
}

// endregion | Helpers
