/**
 * Moderate demo kit showcasing readyup features.
 *
 * Exercises flat and staged checklists, preconditions, nested checks, skip
 * conditions, mixed severities, and fix messages. Run from the repo root:
 *
 *   rdy run demo
 */
import { execFileSync } from 'node:child_process';

import { defineRdyKit, fileContains, fileExists, hasDevDependency, hasPackageJsonField } from 'readyup';

/** Return true if a CLI command is available on PATH. */
function commandExists(name: string): boolean {
  try {
    execFileSync('which', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// -- Flat checklist with preconditions and nested checks --
// Demonstrates: precondition gating, nested check hierarchy, fix messages.

const projectFoundations = {
  name: 'project-foundations',
  preconditions: [
    {
      name: 'package.json exists',
      check: () => fileExists('package.json'),
    },
  ],
  checks: [
    {
      name: 'ESM project ("type": "module")',
      check: () => hasPackageJsonField('type', 'module'),
      fix: 'Add "type": "module" to package.json',
    },
    {
      name: 'packageManager field is set',
      check: () => hasPackageJsonField('packageManager'),
      fix: 'Add "packageManager" to package.json (e.g., "pnpm@10.x.x")',
    },
    {
      name: 'pnpm-workspace.yaml exists',
      check: () => fileExists('pnpm-workspace.yaml'),
      fix: 'Create pnpm-workspace.yaml with workspace package globs',
      checks: [
        {
          name: 'workspace includes packages/*',
          check: () => fileContains('pnpm-workspace.yaml', /packages\/\*/),
        },
      ],
    },
  ],
} as const;

// -- Flat checklist with skip conditions --
// Demonstrates: N/A suppression. Docker and Renovate sections vanish entirely
// when their config files are absent. Only integrations that are present appear.

const optionalIntegrations = {
  name: 'optional-integrations',
  checks: [
    {
      name: 'Docker',
      skip: () => (!fileExists('Dockerfile') ? 'no Dockerfile' : false),
      check: () => true,
      checks: [
        {
          name: 'docker-compose.yaml exists',
          check: () => fileExists('docker-compose.yaml'),
        },
      ],
    },
    {
      name: 'Renovate',
      skip: () => (!fileExists('renovate.json') ? 'no renovate.json' : false),
      check: () => true,
      checks: [
        {
          name: 'extends recommended preset',
          check: () => fileContains('renovate.json', /extends.*config:recommended/),
        },
      ],
    },
    {
      name: 'lefthook in devDependencies',
      check: () => hasDevDependency('lefthook'),
      fix: 'pnpm add --save-dev lefthook',
      checks: [
        {
          name: 'lefthook.yml exists',
          check: () => fileExists('lefthook.yml'),
          fix: 'Add lefthook.yml for git hook management',
        },
      ],
    },
  ],
} as const;

// -- Flat checklist with mixed severities --
// Demonstrates: error, warn, and recommend severity levels. Also shows a
// failed parent with a skipped child (bitbucket-pipelines.yml).

const codeQuality = {
  name: 'code-quality',
  checks: [
    {
      name: '.editorconfig exists',
      check: () => fileExists('.editorconfig'),
      fix: 'Add .editorconfig to repo root',
    },
    {
      name: 'bitbucket-pipelines.yml exists',
      check: () => fileExists('bitbucket-pipelines.yml'),
      fix: 'Add bitbucket-pipelines.yml for CI/CD pipeline configuration',
      checks: [
        {
          name: 'pipeline runs pnpm run check',
          check: () => fileContains('bitbucket-pipelines.yml', /pnpm run check/),
        },
      ],
    },
    {
      name: 'actionlint is installed',
      severity: 'warn' as const,
      check: () => commandExists('actionlint'),
      fix: 'brew install actionlint — catches workflow syntax errors before they hit CI',
    },
    {
      name: 'jq is installed',
      severity: 'recommend' as const,
      check: () => commandExists('jq'),
      fix: 'brew install jq — useful for JSON processing in shell scripts',
    },
  ],
} as const;

// -- Staged checklist with halt-on-failure --
// Demonstrates: sequential group execution. If compliance fails, release
// automation checks are skipped — no point verifying workflows for an
// unpublishable package.

const publishingPipeline = {
  name: 'publishing-pipeline',
  groups: [
    // Stage 1: Build infrastructure
    [
      {
        name: 'shared build script exists',
        check: () => fileExists('config/build.ts'),
        fix: 'Add config/build.ts — packages depend on the shared esbuild configuration',
      },
      {
        name: 'shared Vitest config exists',
        check: () => fileExists('config/vitest.config.ts'),
        fix: 'Add config/vitest.config.ts — packages inherit the shared test configuration',
      },
    ],
    // Stage 2: Compliance
    [
      {
        name: 'LICENSE file exists',
        check: () => fileExists('LICENSE') || fileExists('LICENSE.md'),
        fix: 'Add a LICENSE file — npm publish warns and corporate consumers cannot use unlicensed packages',
      },
      {
        name: '.npmrc configures save-exact',
        check: () => fileContains('.npmrc', /save-exact\s*=\s*true/),
        fix: 'Add save-exact=true to .npmrc for reproducible installs',
      },
    ],
    // Stage 3: Release automation (skipped if compliance fails)
    [
      {
        name: 'release workflow exists',
        check: () => fileExists('.github/workflows/release.yaml'),
      },
    ],
  ],
  fixLocation: 'inline' as const,
} as const;

export default defineRdyKit({
  checklists: [projectFoundations, optionalIntegrations, codeQuality, publishingPipeline],
});
