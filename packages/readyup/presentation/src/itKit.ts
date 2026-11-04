import type { KitModel } from './kitModel.ts';

/** The machine diagnostic that `github:acme/diagnose` publishes, with FileVault off and Homebrew outdated. */
export const IT_KIT: KitModel = {
  name: 'default',
  command: 'rdy run --from github:acme/diagnose',
  origin: { source: 'github:acme/diagnose', version: 'main' },
  compiledWith: '0.43.0',
  conditions: [
    { id: 'os', label: 'macOS is 15 or later', on: true },
    { id: 'filevault', label: 'FileVault is on', on: false },
    { id: 'vpn', label: 'VPN profile is installed', on: true },
    { id: 'chrome', label: 'Managed Chrome is installed', on: true },
    { id: 'node', label: 'Node 24 through asdf', on: true },
    { id: 'brew', label: 'Homebrew is current', on: false },
  ],
  checklists: [
    {
      name: 'machine',
      ms: 1402,
      checks: [
        {
          name: 'macOS is 15 or later',
          severity: 'error',
          when: 'os',
          detail: 'macOS 15.6',
          failDetail: 'macOS 14.7',
          fix: 'Update macOS from System Settings › General › Software Update',
        },
        {
          name: 'FileVault is on',
          severity: 'error',
          when: 'filevault',
          ms: 118,
          failDetail: 'FileVault is off',
          fix: 'Turn on FileVault in System Settings › Privacy & Security',
        },
        {
          name: 'Company VPN profile is installed',
          severity: 'error',
          when: 'vpn',
          ms: 204,
          failDetail: 'No configuration profile named "Acme VPN"',
          fix: 'Install the profile from it.acme.internal/vpn',
        },
        {
          name: 'Managed Chrome is installed',
          severity: 'warn',
          when: 'chrome',
          failDetail: 'Google Chrome is not in /Applications',
          fix: 'Install Chrome from Self Service',
        },
        {
          name: 'Node 24 is installed through asdf',
          severity: 'warn',
          when: 'node',
          detail: 'node 24.11.0',
          failDetail: '.tool-versions names node 22.12.0',
          fix: 'Run asdf install nodejs 24.11.0, then asdf set --home nodejs 24.11.0',
        },
        {
          name: 'Homebrew is current',
          severity: 'recommend',
          when: 'brew',
          ms: 1012,
          failDetail: '3 formulae are outdated',
          fix: 'Run brew upgrade',
        },
      ],
    },
  ],
};
