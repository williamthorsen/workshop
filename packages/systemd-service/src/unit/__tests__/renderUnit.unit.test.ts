import { describe, expect, it } from 'vitest';

import { renderUnit, type ServiceSpec } from '../renderUnit.ts';

describe(renderUnit, () => {
  it('renders a keep-alive service that appends its output to the log directory', () => {
    expect(renderUnit(buildSpec())).toBe(`[Unit]
Description=dev.example
StartLimitIntervalSec=0

[Service]
ExecStart="/usr/bin/node" "/srv/example/bin/run.js"
Restart=always
RestartSec=10
StandardError=append:/var/log/example/stderr.log
StandardOutput=append:/var/log/example/stdout.log

[Install]
WantedBy=multi-user.target
`);
  });

  it('renders the keep-alive service for an explicit keep-alive trigger', () => {
    expect(renderUnit(buildSpec({ trigger: { keepAlive: true } }))).toBe(renderUnit(buildSpec()));
  });

  it('renders a scheduled service as a oneshot that neither restarts nor is enabled itself', () => {
    expect(renderUnit(buildSpec({ trigger: { startIntervalSec: 86_400 } }))).toBe(`[Unit]
Description=dev.example
StartLimitIntervalSec=0

[Service]
Type=oneshot
ExecStart="/usr/bin/node" "/srv/example/bin/run.js"
StandardError=append:/var/log/example/stderr.log
StandardOutput=append:/var/log/example/stdout.log
`);
  });

  it('renders the dependencies and environment of a scheduled service', () => {
    const unit = renderUnit(
      buildSpec({ after: ['docker.service'], environment: { HOME: '/root' }, trigger: { startIntervalSec: 60 } }),
    );

    expect(unit).toContain('After=docker.service\nWants=docker.service\nStartLimitIntervalSec=0\n');
    expect(unit).toContain('Type=oneshot\nEnvironment="HOME=/root"\nExecStart=');
  });

  it('orders the service after the units that it names and pulls them in', () => {
    const unit = renderUnit(buildSpec({ after: ['docker.service', 'network-online.target'] }));

    expect(unit).toContain('After=docker.service network-online.target\nWants=docker.service network-online.target\n');
  });

  it('renders one Environment line per variable, in key order', () => {
    const unit = renderUnit(buildSpec({ environment: { PATH: '/opt/bin:/usr/bin', HOME: '/root' } }));

    expect(unit).toContain('Environment="HOME=/root"\nEnvironment="PATH=/opt/bin:/usr/bin"\nExecStart=');
  });

  it('escapes backslashes, quotes, specifiers, and variables in program arguments', () => {
    const unit = renderUnit(buildSpec({ programArguments: ['/usr/bin/echo', String.raw`a\b "c" 100% $HOME`] }));

    expect(unit).toContain(String.raw`ExecStart="/usr/bin/echo" "a\\b \"c\" 100%% $$HOME"`);
  });

  it('escapes specifiers but not variables in environment values', () => {
    const unit = renderUnit(buildSpec({ environment: { GREETING: 'say "50%" to $USER' } }));

    expect(unit).toContain(String.raw`Environment="GREETING=say \"50%%\" to $USER"`);
  });

  it('escapes specifiers in the name and the log directory', () => {
    const unit = renderUnit(buildSpec({ logDir: '/var/log/100%', name: 'dev%example' }));

    expect(unit).toContain('Description=dev%%example\n');
    expect(unit).toContain('StandardOutput=append:/var/log/100%%/stdout.log\n');
  });
});

// region | Helpers

/** Builds a minimal spec. */
function buildSpec(overrides: Partial<ServiceSpec> = {}): ServiceSpec {
  return {
    logDir: '/var/log/example',
    name: 'dev.example',
    programArguments: ['/usr/bin/node', '/srv/example/bin/run.js'],
    ...overrides,
  };
}

// endregion | Helpers
