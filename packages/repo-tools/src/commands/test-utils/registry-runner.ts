import fs from 'node:fs';

import { createTempTree } from '@williamthorsen/toolbelt.testing/candidate';

import type { GitHubFacts, GitHubReader } from '../../github/github-repo.ts';
import { buildFakeAdapters, FAKE_HOME, type FakeClone } from './fake-clones.ts';
import { type CapturedRun, runCaptured } from './run-captured.ts';

/**
 * Returns a function that runs a verb against a fixture registry, returning the captured run and the registry's text
 * afterward. The registry is passed as `--file` after the verb, so that an option missing its value stays the last
 * argument. A run without GitHub facts, from its setup or the defaults, fails every GitHub read.
 */
export function buildRegistryRunner(defaults: {
  clones: Record<string, FakeClone>;
  github?: Record<string, GitHubFacts>;
  registry: string;
}): (args: string[], setup?: RegistrySetup) => Promise<RegistryRun> {
  return async (args, setup = {}) => {
    using tree = createTempTree({ 'repos.yaml': setup.registry ?? defaults.registry }, { prefix: 'repo-tools-' });
    const file = tree.resolve('repos.yaml');
    const adapters = buildFakeAdapters(setup.clones ?? defaults.clones, setup.origins, setup.branch);
    const github = setup.github ?? defaults.github;
    const result = await runCaptured([...args.slice(0, 1), '--file', file, ...args.slice(1)], {
      adapters,
      env: setup.env ?? { HOME: FAKE_HOME },
      ...(github !== undefined && { github: fakeGitHub(github) }),
    });
    return { registryText: fs.readFileSync(file, 'utf8'), result };
  };
}

/** The outcome of a run against a fixture registry. */
export interface RegistryRun {
  registryText: string;
  result: CapturedRun;
}

/** The fixture state of one run, each omitted field taking the runner's default. */
export interface RegistrySetup {
  branch?: string;
  clones?: Record<string, FakeClone>;
  /** The environment of the run, replacing the default that sets only `HOME`. */
  env?: Record<string, string>;
  github?: Record<string, GitHubFacts>;
  origins?: Record<string, string>;
  registry?: string;
}

// region | Helpers

/** Returns a reader over the given facts, failing for a repo that they lack. */
function fakeGitHub(byRepo: Record<string, GitHubFacts>): GitHubReader {
  return (repo) => byRepo[repo] ?? 'no such repo';
}

// endregion | Helpers
