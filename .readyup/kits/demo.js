/** @noformat — @generated. Do not edit. Compiled by rdy. */
/* eslint-disable */


// .readyup/kits/demo.ts
import { execFileSync } from "node:child_process";

// packages/readyup/dist/esm/authoring.js
function defineRdyKit(kit) {
  return kit;
}

// packages/readyup/dist/esm/isRecord.js
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/readyup/dist/esm/check-utils/filesystem.js
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
function fileExists(relativePath) {
  return existsSync(join(process.cwd(), relativePath));
}
function readFile(relativePath) {
  const fullPath = join(process.cwd(), relativePath);
  if (!existsSync(fullPath)) return void 0;
  return readFileSync(fullPath, "utf8");
}
function fileContains(relativePath, pattern) {
  const content = readFile(relativePath);
  if (content === void 0) return false;
  return pattern.test(content);
}

// packages/readyup/dist/esm/check-utils/hashing.js
import { createHash } from "node:crypto";

// packages/readyup/dist/esm/safeJsonParse.js
function safeJsonParse(content) {
  try {
    const parsed = JSON.parse(content);
    return parsed;
  } catch {
    return void 0;
  }
}

// packages/readyup/dist/esm/check-utils/json.js
function readJsonFile(relativePath) {
  const content = readFile(relativePath);
  if (content === void 0) return void 0;
  const parsed = safeJsonParse(content);
  if (!isRecord(parsed)) return void 0;
  return parsed;
}
function hasJsonField(relativePath, field, expectedValue) {
  const data = readJsonFile(relativePath);
  if (data === void 0) return false;
  if (expectedValue !== void 0) return data[field] === expectedValue;
  return field in data;
}

// packages/readyup/dist/esm/check-utils/package-json.js
function hasPackageJsonField(field, expectedValue) {
  return hasJsonField("package.json", field, expectedValue);
}
function hasDevDependency(name) {
  const pkg = readJsonFile("package.json");
  if (pkg === void 0) return false;
  const devDeps = pkg.devDependencies;
  return isRecord(devDeps) && name in devDeps;
}

// .readyup/kits/demo.ts
function commandExists2(name) {
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
      check: () => commandExists2("actionlint"),
      fix: "brew install actionlint \u2014 catches workflow syntax errors before they hit CI"
    },
    {
      name: "jq is installed",
      severity: "recommend",
      check: () => commandExists2("jq"),
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
        name: "shared build script exists",
        check: () => fileExists("config/build.ts"),
        fix: "Add config/build.ts \u2014 packages depend on the shared esbuild configuration"
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
