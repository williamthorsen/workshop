import type { Violation } from '../../consistency/Violation.ts';
import type { RenderTarget } from '../../schemas/render-target-schemas.ts';

/**
 * Reports a host declared where one of the deployments' tree layouts needs a directory.
 *
 * That is the one contradiction no artifact set could resolve, and it holds two ways: the host stands at a root
 * itself, or it stands at a directory some root is nested inside. A host merely sitting inside a root is not one, a
 * directory layout rooted at `skills` claiming `skills/<name>/<entryFile>` and never a file directly beneath it. A root
 * at the empty string is the target root, which every host is under and no host contradicts.
 *
 * A host whose shape a tree layout's claim rule could match, such as one at the target root under a file layout rooted
 * there, is decidable only against the slugs a catalog turns out to contain. The scan that reads current target state
 * excludes declared hosts instead.
 */
export function findHostCollisions(
  host: string,
  deployments: RenderTarget['deployments'],
  path: string,
): Array<Violation> {
  const layoutRoots = deployments
    .filter((deployment) => deployment.form === 'tree')
    .map((deployment) => deployment.layout.root)
    .filter((root) => root !== '');

  return layoutRoots
    .filter((root) => host === root || root.startsWith(`${host}/`))
    .map((root) => ({
      path,
      message: `collides with the layout root "${root}", which needs a directory where this host is a file`,
    }));
}
