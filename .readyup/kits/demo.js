/** @noformat — @generated. Do not edit. Compiled by rdy. */
/* eslint-disable */
export const __readyupVersion = "0.22.0";


// .readyup/kits/demo.ts
import { execFileSync } from "node:child_process";
import { defineRdyKit } from "readyup";
import { fileContains, fileExists, hasDevDependency, hasPackageJsonField } from "readyup/check-utils";
function commandExists(name) {
  try {
    execFileSync("which", [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
var projectFoundations = {
  name: "project-foundations",
  preconditions: [
    {
      name: "package.json exists",
      check: () => fileExists("package.json")
    }
  ],
  checks: [
    {
      name: 'ESM project ("type": "module")',
      check: () => hasPackageJsonField("type", "module"),
      fix: 'Add "type": "module" to package.json'
    },
    {
      name: "packageManager field is set",
      check: () => hasPackageJsonField("packageManager"),
      fix: 'Add "packageManager" to package.json (e.g., "pnpm@10.x.x")'
    },
    {
      name: "pnpm-workspace.yaml exists",
      check: () => fileExists("pnpm-workspace.yaml"),
      fix: "Create pnpm-workspace.yaml with workspace package globs",
      checks: [
        {
          name: "workspace includes packages/*",
          check: () => fileContains("pnpm-workspace.yaml", /packages\/\*/)
        }
      ]
    }
  ]
};
var optionalIntegrations = {
  name: "optional-integrations",
  checks: [
    {
      name: "Docker",
      skip: () => !fileExists("Dockerfile") ? "no Dockerfile" : false,
      check: () => true,
      checks: [
        {
          name: "docker-compose.yaml exists",
          check: () => fileExists("docker-compose.yaml")
        }
      ]
    },
    {
      name: "Renovate",
      skip: () => !fileExists("renovate.json") ? "no renovate.json" : false,
      check: () => true,
      checks: [
        {
          name: "extends recommended preset",
          check: () => fileContains("renovate.json", /extends.*config:recommended/)
        }
      ]
    },
    {
      name: "lefthook in devDependencies",
      check: () => hasDevDependency("lefthook"),
      fix: "pnpm add --save-dev lefthook",
      checks: [
        {
          name: "lefthook.yml exists",
          check: () => fileExists("lefthook.yml"),
          fix: "Add lefthook.yml for git hook management"
        }
      ]
    }
  ]
};
var codeQuality = {
  name: "code-quality",
  checks: [
    {
      name: ".editorconfig exists",
      check: () => fileExists(".editorconfig"),
      fix: "Add .editorconfig to repo root"
    },
    {
      name: "bitbucket-pipelines.yml exists",
      check: () => fileExists("bitbucket-pipelines.yml"),
      fix: "Add bitbucket-pipelines.yml for CI/CD pipeline configuration",
      checks: [
        {
          name: "pipeline runs pnpm run check",
          check: () => fileContains("bitbucket-pipelines.yml", /pnpm run check/)
        }
      ]
    },
    {
      name: "actionlint is installed",
      severity: "warn",
      check: () => commandExists("actionlint"),
      fix: "brew install actionlint \u2014 catches workflow syntax errors before they hit CI"
    },
    {
      name: "jq is installed",
      severity: "recommend",
      check: () => commandExists("jq"),
      fix: "brew install jq \u2014 useful for JSON processing in shell scripts"
    }
  ]
};
var publishingPipeline = {
  name: "publishing-pipeline",
  groups: [
    // Stage 1: Build infrastructure
    [
      {
        name: "build config exists",
        check: () => fileExists(".config/nmr.config.ts"),
        fix: "Add .config/nmr.config.ts to declare per-repo nmr script overrides"
      },
      {
        name: "shared Vitest config exists",
        check: () => fileExists("config/vitest.config.ts"),
        fix: "Add config/vitest.config.ts \u2014 packages inherit the shared test configuration"
      }
    ],
    // Stage 2: Compliance
    [
      {
        name: "LICENSE file exists",
        check: () => fileExists("LICENSE") || fileExists("LICENSE.md"),
        fix: "Add a LICENSE file \u2014 npm publish warns and corporate consumers cannot use unlicensed packages"
      },
      {
        name: ".npmrc configures save-exact",
        check: () => fileContains(".npmrc", /save-exact\s*=\s*true/),
        fix: "Add save-exact=true to .npmrc for reproducible installs"
      }
    ],
    // Stage 3: Release automation (skipped if compliance fails)
    [
      {
        name: "release workflow exists",
        check: () => fileExists(".github/workflows/release.yaml")
      }
    ]
  ],
  fixLocation: "inline"
};
var demo_default = defineRdyKit({
  checklists: [projectFoundations, optionalIntegrations, codeQuality, publishingPipeline]
});
export {
  demo_default as default
};
