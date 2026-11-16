import type { GitHubFacts } from '../../github/github-repo.ts';
import { buildClone } from './fake-clones.ts';

/** The fixture registry against which the `list`, `scan`, and `add` tests run. */
export const REGISTRY = `# Header comment.
repos:
  - name: alpha
    path: ~/repos/alpha
    repo: owner/alpha
    visibility: private
    runner: imac2
    tags: [live]
    stack: [nmr]
  - name: beta
    path: ~/repos/beta
    repo: owner/beta
    visibility: private
    tags: [live, vault]
  - name: gamma
    path: ~/repos/gamma
    repo: owner/gamma
    visibility: public
    stack: [nextjs, react]
`;

/** `REGISTRY` with a prefix on `alpha` and on `gamma`. */
export const PREFIXED_REGISTRY = REGISTRY.replace(
  '    repo: owner/alpha\n',
  '    repo: owner/alpha\n    prefix: A\n',
).replace('    repo: owner/gamma\n', '    repo: owner/gamma\n    prefix: G\n');

/** Clones whose files signal exactly the stack that `REGISTRY` declares. */
export const CURRENT_CLONES = {
  alpha: buildClone({ 'package.json': { '@williamthorsen/nmr': '1' } }),
  beta: buildClone({ 'README.md': '' }),
  gamma: buildClone({ 'apps/web/package.json': { next: '15', react: '19' } }),
};

/** GitHub facts that equal what `REGISTRY` records, keyed by repo. */
export const CURRENT_GITHUB: Record<string, GitHubFacts> = {
  'owner/alpha': facts('private', 'imac2'),
  'owner/beta': facts('private'),
  'owner/gamma': facts('public'),
};

/** Returns the facts of a repo without a `CI_RUNS_ON` problem. */
export function facts(visibility: GitHubFacts['visibility'], runner?: string): GitHubFacts {
  return { runner, runnerProblem: undefined, visibility };
}
