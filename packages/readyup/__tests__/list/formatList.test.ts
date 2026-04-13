import { describe, expect, it } from 'vitest';

import { formatConsumerView, formatEmpty, formatOwnerView } from '../../src/list/formatList.ts';

describe(formatOwnerView, () => {
  it('renders only the Internal section when compiled kits are empty', () => {
    const result = formatOwnerView({
      internalKits: ['default', 'deploy'],
      compiledKits: [],
      compiledStyle: { kind: 'local-convention' },
    });

    expect(result).toContain('Internal:');
    expect(result).not.toContain('Compiled:');
    expect(result).toContain('deploy');
  });

  it('renders only the Compiled section when internal kits are empty', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: ['deploy'],
      compiledStyle: { kind: 'local-convention' },
    });

    expect(result).not.toContain('Internal:');
    expect(result).toContain('Compiled:');
    expect(result).toContain('deploy');
  });

  it('uses brackets around positional name in internal hint when default exists', () => {
    const result = formatOwnerView({
      internalKits: ['default'],
      compiledKits: ['deploy'],
      compiledStyle: { kind: 'local-convention' },
    });

    const lines = result.split('\n');
    const internalHeader = lines.find((l) => l.startsWith('Internal:'));
    const compiledHeader = lines.find((l) => l.startsWith('Compiled:'));

    expect(internalHeader).toContain('rdy run --jit [<name>]');
    expect(compiledHeader).toContain('rdy run <name>');
  });

  it('uses brackets in compiled hint when default is in compiled kits', () => {
    const result = formatOwnerView({
      internalKits: ['deploy'],
      compiledKits: ['default', 'monitor'],
      compiledStyle: { kind: 'local-convention' },
    });

    const lines = result.split('\n');
    const internalHeader = lines.find((l) => l.startsWith('Internal:'));
    const compiledHeader = lines.find((l) => l.startsWith('Compiled:'));

    expect(internalHeader).toContain('rdy run --jit <name>');
    expect(compiledHeader).toContain('rdy run [<name>]');
  });

  it('omits brackets around positional name when no default kit exists', () => {
    const result = formatOwnerView({
      internalKits: ['deploy'],
      compiledKits: [],
      compiledStyle: { kind: 'local-convention' },
    });

    expect(result).toContain('rdy run --jit <name>');
    expect(result).not.toContain('[<name>]');
  });

  it('includes --jit in internal hints but not compiled hints', () => {
    const result = formatOwnerView({
      internalKits: ['default'],
      compiledKits: ['deploy'],
      compiledStyle: { kind: 'local-convention' },
    });

    const lines = result.split('\n');
    const internalHeader = lines.find((l) => l.startsWith('Internal:'));
    const compiledHeader = lines.find((l) => l.startsWith('Compiled:'));

    expect(internalHeader).toContain('--jit');
    expect(compiledHeader).not.toContain('--jit');
  });

  it('renders custom outDir style with file paths', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: ['deploy', 'monitor'],
      compiledStyle: { kind: 'custom-outDir', outDirRel: 'dist/kits' },
    });

    expect(result).toContain('rdy run --file <file path>');
    expect(result).toContain('dist/kits/deploy.js');
    expect(result).toContain('dist/kits/monitor.js');
  });

  it('returns empty-owner message when both lists are empty', () => {
    const result = formatOwnerView({
      internalKits: [],
      compiledKits: [],
      compiledStyle: { kind: 'local-convention' },
    });

    expect(result).toBe(
      'No kits found.\nRun `rdy init` to scaffold an internal kit or `rdy compile` to compile a kit from source.',
    );
  });

  it('renders both sections when both have kits', () => {
    const result = formatOwnerView({
      internalKits: ['default'],
      compiledKits: ['deploy'],
      compiledStyle: { kind: 'local-convention' },
    });

    expect(result).toContain('Internal:');
    expect(result).toContain('Compiled:');
  });
});

describe(formatConsumerView, () => {
  it('renders compiled kits with the from arg in the hint', () => {
    const result = formatConsumerView({
      compiledKits: ['default', 'deploy'],
      fromArg: '.',
      kitsDir: '/resolved/.rdy/kits',
    });

    expect(result).toContain('rdy run --from .');
    expect(result).toContain('default');
    expect(result).toContain('deploy');
  });

  it('preserves the exact fromArg in the hint', () => {
    const result = formatConsumerView({
      compiledKits: ['deploy'],
      fromArg: '/other',
      kitsDir: '/other/.rdy/kits',
    });

    expect(result).toContain('rdy run --from /other');
  });

  it('uses brackets around positional name when default kit exists', () => {
    const result = formatConsumerView({
      compiledKits: ['default'],
      fromArg: '.',
      kitsDir: '/resolved/.rdy/kits',
    });

    expect(result).toContain('rdy run --from . [<name>]');
  });

  it('omits brackets around positional name when default kit is absent', () => {
    const result = formatConsumerView({
      compiledKits: ['deploy'],
      fromArg: '.',
      kitsDir: '/resolved/.rdy/kits',
    });

    expect(result).toContain('rdy run --from . <name>');
    expect(result).not.toContain('[<name>]');
  });

  it('returns empty message with resolved kitsDir for local path', () => {
    const result = formatConsumerView({
      compiledKits: [],
      fromArg: '.',
      kitsDir: '/resolved/.rdy/kits',
    });

    expect(result).toBe('No compiled kits found at /resolved/.rdy/kits.');
  });

  it('returns empty message with home-based path for global source', () => {
    const result = formatConsumerView({
      compiledKits: [],
      fromArg: 'global',
      kitsDir: '/home/user/.rdy/kits',
    });

    expect(result).toBe('No compiled kits found at /home/user/.rdy/kits.');
  });

  it('returns empty message with directory path for dir: source', () => {
    const result = formatConsumerView({
      compiledKits: [],
      fromArg: 'dir:/custom/path',
      kitsDir: '/custom/path',
    });

    expect(result).toBe('No compiled kits found at /custom/path.');
  });
});

describe(formatEmpty, () => {
  it('returns owner message for owner mode', () => {
    const result = formatEmpty('owner');

    expect(result).toContain('rdy init');
    expect(result).toContain('rdy compile');
  });

  it('returns consumer message with the provided kitsDir', () => {
    const result = formatEmpty('consumer', '/home/user/.rdy/kits');

    expect(result).toBe('No compiled kits found at /home/user/.rdy/kits.');
  });

  it('defaults consumer kitsDir to ".rdy/kits" when omitted', () => {
    const result = formatEmpty('consumer');

    expect(result).toBe('No compiled kits found at .rdy/kits.');
  });
});
