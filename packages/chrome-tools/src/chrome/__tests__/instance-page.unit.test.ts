import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { escapeHtml, writeInstancePage } from '../instance-page.ts';
import { makeFakeThorChrome } from '../test-utils/fake-thor-chrome.ts';

describe(escapeHtml, () => {
  it('escapes the characters that markup and attribute values reserve', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});

describe(writeInstancePage, () => {
  it('writes the label, the provenance, the escaped launch command, and the commands that reach the instance', () => {
    const fake = makeFakeThorChrome();
    const invocation = fake.makeInvocation();
    invocation.origin = 'derived';
    invocation.work = { branch: '321', repo: 'widget', repoDir: '/repos/widget' };
    const dir = fake.makeProfile('widget-321');
    writeInstancePage(invocation, {
      browser: 'chrome',
      browserApp: '/bin/chrome',
      label: 'widget-321 · :9321',
      launchCommand: ['/bin/chrome', 'http://h/?a=1&b=2'],
      logFile: '/tmp/thor-chrome-widget-321.log',
      pageFile: `${dir}/thor-chrome.html`,
      port: '9321',
      profile: 'widget-321',
    });
    const page = fs.readFileSync(`${dir}/thor-chrome.html`, 'utf8');
    expect(page).toContain('<title>widget-321 · :9321</title>');
    expect(page).toContain('derived from branch <code>321</code> of <code>widget</code> at <code>/repos/widget</code>');
    expect(page).toContain('<dt>Launched at</dt><dd>2026-01-02T03:04:05Z</dd>');
    expect(page).toContain(String.raw`<pre>/bin/chrome http://h/\?a=1\&amp;b=2</pre>`);
    expect(page).toContain('thor-chrome quit widget-321\nthor-chrome delete widget-321</pre>');
    expect(page).toMatch(/<dt>Profile created<\/dt><dd>(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ|unknown)<\/dd>/);
  });

  it('replaces the page left by an earlier launch', () => {
    const fake = makeFakeThorChrome();
    const dir = fake.makeProfile('thrive');
    const pageFile = `${dir}/thor-chrome.html`;
    fs.writeFileSync(pageFile, 'stale page\n');
    writeInstancePage(fake.makeInvocation(), {
      browser: 'chrome',
      browserApp: '/c',
      label: 'thrive · :9321',
      launchCommand: [],
      logFile: '/l',
      pageFile,
      port: '9321',
      profile: 'thrive',
    });
    const page = fs.readFileSync(pageFile, 'utf8');
    expect(page).toContain('<title>thrive · :9321</title>');
    expect(page).not.toContain('stale page');
  });

  it('describes a named and an underived profile', () => {
    const fake = makeFakeThorChrome();
    const dir = fake.makeProfile('thrive');
    const facts = {
      browser: 'chrome',
      browserApp: '/c',
      label: 'l',
      launchCommand: [],
      logFile: '/l',
      pageFile: `${dir}/p.html`,
      port: '1',
      profile: 'thrive',
    };
    const invocation = fake.makeInvocation();
    writeInstancePage(invocation, facts);
    expect(fs.readFileSync(facts.pageFile, 'utf8')).toContain('named by the caller');
    invocation.origin = 'underived';
    writeInstancePage(invocation, facts);
    expect(fs.readFileSync(facts.pageFile, 'utf8')).toContain('none: no repository or branch resolved');
  });
});
