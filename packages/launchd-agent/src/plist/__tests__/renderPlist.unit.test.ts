import { describe, expect, it } from 'vitest';

import { type AgentSpec, renderPlist } from '../renderPlist.ts';

const homebrewBin = '/usr/local/bin';

const spec: AgentSpec = {
  label: 'dev.example.agent',
  logDir: '/Users/someone/Library/Logs/example',
  programArguments: [
    '/Users/someone/.asdf/installs/nodejs/24.18.0/bin/node',
    '/Users/someone/repos/example.live/bin/example.js',
    'run',
  ],
  trigger: { startIntervalSec: 900 },
};

describe(renderPlist, () => {
  it('lists the program arguments in order', () => {
    expect(renderPlist(spec, { homebrewBin })).toContain(
      [
        '  <key>ProgramArguments</key>',
        '  <array>',
        ...spec.programArguments.map((argument) => `    <string>${argument}</string>`),
        '  </array>',
      ].join('\n'),
    );
  });

  it("puts the Homebrew bin on PATH ahead of launchd's default, sbin directories included", () => {
    expect(renderPlist(spec, { homebrewBin })).toContain(
      '<key>PATH</key>\n    <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>',
    );
  });

  it("sets PATH to launchd's default when Homebrew is not known", () => {
    expect(renderPlist(spec)).toContain('<key>PATH</key>\n    <string>/usr/bin:/bin:/usr/sbin:/sbin</string>');
  });

  it('renders environment variables in key order alongside the default PATH', () => {
    const plist = renderPlist({ ...spec, environment: { TZ: 'UTC', LANG: 'en_US.UTF-8' } }, { homebrewBin });

    expect(plist).toMatch(/<key>LANG<\/key>[\s\S]*<key>PATH<\/key>[\s\S]*<key>TZ<\/key>/);
    expect(plist).toContain('<key>TZ</key>\n    <string>UTC</string>');
  });

  it("replaces the default PATH with the spec's own", () => {
    const plist = renderPlist({ ...spec, environment: { PATH: '/opt/tools/bin' } }, { homebrewBin });

    expect(plist).toContain('<key>PATH</key>\n    <string>/opt/tools/bin</string>');
    expect(plist).not.toContain('/usr/local/bin');
  });

  it('sends each stream to its own log file under the log directory', () => {
    const plist = renderPlist(spec, { homebrewBin });

    expect(plist).toContain(`<key>StandardOutPath</key>\n  <string>${spec.logDir}/stdout.log</string>`);
    expect(plist).toContain(`<key>StandardErrorPath</key>\n  <string>${spec.logDir}/stderr.log</string>`);
  });

  it('starts an interval agent at load and every interval after, without keeping it alive', () => {
    const plist = renderPlist(spec, { homebrewBin });

    expect(plist).toContain('<key>RunAtLoad</key>\n  <true/>');
    expect(plist).toContain('<key>StartInterval</key>\n  <integer>900</integer>');
    expect(plist).not.toContain('KeepAlive');
  });

  it('starts a keep-alive agent at load and keeps it alive, without an interval', () => {
    const plist = renderPlist({ ...spec, trigger: { keepAlive: true } }, { homebrewBin });

    expect(plist).toContain('<key>RunAtLoad</key>\n  <true/>');
    expect(plist).toContain('<key>KeepAlive</key>\n  <true/>');
    expect(plist).not.toContain('StartInterval');
  });

  it('contains the label that launchctl addresses the agent by', () => {
    expect(renderPlist(spec, { homebrewBin })).toContain(`<key>Label</key>\n  <string>${spec.label}</string>`);
  });

  it('escapes a value holding a character that would otherwise open XML markup', () => {
    const plist = renderPlist(
      { ...spec, environment: { 'A&B': '<c>' }, programArguments: ['/Users/a&b/<c>/example.js'] },
      { homebrewBin },
    );

    expect(plist).toContain('<string>/Users/a&amp;b/&lt;c&gt;/example.js</string>');
    expect(plist).toContain('<key>A&amp;B</key>\n    <string>&lt;c&gt;</string>');
  });
});
