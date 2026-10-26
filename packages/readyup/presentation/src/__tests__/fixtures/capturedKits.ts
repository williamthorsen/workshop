import type { KitModel } from '../../kits.ts';

const TOOLBELT_README = 'https://github.com/williamthorsen/toolbelt/tree/main/packages/errors#readme';

/** The models of the captured kits that the deck no longer shows, keyed by the capture's prefix. */
export const CAPTURED_KITS = {
  drift: {
    name: 'default',
    command: 'rdy run --from npm:@williamthorsen/release-kit',
    origin: { source: 'npm:@williamthorsen/release-kit', version: '14.2.2' },
    compiledWith: '0.41.0',
    conditions: [
      { id: 'current', label: 'release-kit is current', on: true },
      { id: 'publish', label: 'publish.yaml matches its template', on: true },
      { id: 'labels', label: 'labels.yaml has the current preset', on: true },
      { id: 'sync', label: 'sync-labels.yaml exists', on: true },
    ],
    checklists: [
      {
        name: 'release-kit',
        ms: 170,
        checks: [
          {
            name: '@williamthorsen/release-kit in devDependencies',
            severity: 'error',
            ms: 136,
            fix: 'pnpm add --save-dev @williamthorsen/release-kit',
            checks: [
              {
                name: '@williamthorsen/release-kit >= 14.2.2',
                severity: 'error',
                when: 'current',
                fix: 'pnpm add --save-dev @williamthorsen/release-kit@^14.2.2',
              },
            ],
          },
          {
            name: 'publish.yaml workflow exists',
            severity: 'warn',
            checks: [
              {
                name: 'publish.yaml matches template',
                severity: 'warn',
                when: 'publish',
                fix: 'Run `release-kit update-templates` to regenerate publish.yaml from the current template',
              },
            ],
          },
          {
            name: '.config/release-kit.config.ts exports a config',
            severity: 'error',
            checks: [
              {
                name: '.github/labels.yaml exists',
                severity: 'warn',
                fix: 'Run `release-kit sync-labels generate` to produce the labels file',
                checks: [
                  {
                    name: 'labels.yaml has current common preset',
                    severity: 'warn',
                    when: 'labels',
                    fix: 'Run `release-kit sync-labels generate` to incorporate updated common labels',
                  },
                ],
              },
            ],
          },
          {
            name: 'published packages ship the changelog archives',
            severity: 'warn',
            na: 'changelogMarkdown.keepVersions is not set',
          },
          {
            name: 'sync-labels.yaml workflow exists',
            severity: 'warn',
            when: 'sync',
            fix: 'Run `release-kit sync-labels init` to scaffold the workflow',
            checks: [{ name: 'sync-labels.yaml matches template', severity: 'warn' }],
          },
        ],
      },
    ],
  },
  adoption: {
    name: 'default',
    command: 'rdy run --from npm:@williamthorsen/toolbelt.errors',
    origin: { source: 'npm:@williamthorsen/toolbelt.errors', version: '0.8.3' },
    compiledWith: '0.40.0',
    conditions: [
      { id: 'helper', label: 'Sources import describeError', on: true },
      { id: 'inline', label: 'Sources describe thrown values with it', on: true },
      { id: 'narrow', label: 'Sources narrow thrown values with isError', on: false },
      { id: 'coerce', label: 'Sources do not coerce thrown values by hand', on: true },
    ],
    checklists: [
      {
        name: 'adoption',
        ms: 1_515,
        checks: [
          {
            name: 'No source defines its own description helper',
            id: 'toolbelt.errors/no-describe-clone',
            progress: [72, 73],
            findings: true,
            severity: 'warn',
            when: 'helper',
            failDetail: 'describeFailure (packages/repo-tools/src/probe/probe.ts:3)',
            fix:
              'Delete the function named above and import describeError from @williamthorsen/toolbelt.errors. One import replaces the whole helper. Reference: ' +
              TOOLBELT_README,
          },
          {
            name: 'No source describes a thrown value inline',
            id: 'toolbelt.errors/no-inline-description',
            progress: [72, 73],
            findings: true,
            severity: 'warn',
            when: 'inline',
            failDetail: 'packages/repo-tools/src/probe/probe.ts:4',
            fix: 'Replace each expression named above with describeError, imported from @williamthorsen/toolbelt.errors. A domain-literal fallback discards what was thrown; describeError keeps it.',
          },
          {
            name: 'No source narrows a thrown value by hand',
            id: 'toolbelt.errors/no-instanceof-error',
            progress: [72, 73],
            findings: true,
            severity: 'recommend',
            when: 'narrow',
            failDetail: 'packages/readyup/src/run/runRdy.ts:264',
            fix: 'Use isError from @williamthorsen/toolbelt.errors, or assertIsError from @williamthorsen/toolbelt.errors/candidate when the narrowing throws. Both recognize an Error crossing a realm boundary, which a bare instanceof test reports as false.',
          },
          {
            name: 'No source coerces a thrown value to an Error by hand',
            id: 'toolbelt.errors/no-error-coercion',
            progress: [72, 73],
            findings: true,
            severity: 'recommend',
            when: 'coerce',
            failDetail: 'packages/repo-tools/src/probe/probe.ts:9',
            fix:
              '@williamthorsen/toolbelt.errors publishes no coercer, so this reports an unmet need rather than a substitution. Raise it at ' +
              TOOLBELT_README +
              ' if the sites above are worth one.',
          },
        ],
      },
    ],
  },
  onboard: {
    name: 'machine',
    command: 'rdy run --jit machine',
    conditions: [
      { id: 'brewfile', label: 'Brewfile is satisfied', on: true },
      { id: 'live', label: 'live worktree exists', on: true },
      { id: 'gitconfig', label: '~/.gitconfig is clean', on: false },
    ],
    checklists: [
      {
        name: 'tools',
        ms: 4_926,
        checks: [
          {
            name: 'brew is installed',
            severity: 'error',
            checks: [
              {
                name: 'Homebrew packages match the Brewfile',
                severity: 'warn',
                when: 'brewfile',
                ms: 4_885,
                failDetail:
                  'Formula delta needs to be installed or updated.\nFormula zoxide needs to be installed or updated.',
                fix: 'brew bundle install --global',
              },
            ],
          },
        ],
      },
      {
        name: 'install',
        ms: 1_034,
        checks: [
          {
            name: 'live worktree is checked out on branch live',
            severity: 'error',
            when: 'live',
            detail: '~/repos/configs/macos.live is a worktree of ~/repos/configs/macos',
            failDetail: '~/repos/configs/macos.live does not exist',
            fix: 'Run configs-bootstrap, which creates the live branch and worktree when absent; first move aside anything else at ~/repos/configs/macos.live',
            checks: [
              {
                name: 'Machine profile resolves to a profile root',
                severity: 'error',
                detail: 'Profile laptop resolves to ~/repos/configs/macos.live/profiles/laptop',
                checks: [
                  {
                    name: 'Every varied path has a current mirror point',
                    severity: 'warn',
                    detail: 'The profile root varies no base file',
                  },
                ],
              },
            ],
          },
          {
            name: '~/.gitconfig sets nothing outside its include chain',
            severity: 'warn',
            when: 'gitconfig',
            failDetail: 'commit.gpgsign=true\ngpg.format=ssh',
            fix: 'Move each setting to the fragment that README.md, section "Git identity, signing, and GitHub credentials", names, then remove it from ~/.gitconfig',
          },
        ],
      },
    ],
  },
} satisfies Record<string, KitModel>;
