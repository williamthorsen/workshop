import { describe, expect, it } from 'vitest';

import { renderUnit, type ServiceSpec } from '../renderUnit.ts';

describe(renderUnit, () => {
  it('renders a keep-alive service that appends its output to the log directory', () => {
    expect(renderUnit(buildSpec())).toBe(`[Unit]
Description=dev.example.service
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
    name: 'dev.example.service',
    programArguments: ['/usr/bin/node', '/srv/example/bin/run.js'],
    ...overrides,
  };
}

// endregion | Helpers
