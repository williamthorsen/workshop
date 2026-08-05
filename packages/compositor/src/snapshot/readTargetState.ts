import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { buildContributionPatterns } from '../deployment/contribution-markers.ts';
import { invertDeployedName } from '../deployment/name-templates.ts';
import type { RegionClassification } from '../ownership/classifyRegion.ts';
import { classifyRegion } from '../ownership/classifyRegion.ts';
import { extractRegionContent } from '../ownership/extractRegionContent.ts';
import type { Contribution } from '../ownership/readContributions.ts';
import { readContributions } from '../ownership/readContributions.ts';
import { compareStrings } from '../portable/compareStrings.ts';
import { encodeBlob } from '../portable/encodeBlob.ts';
import { expandPath } from '../portable/expandPath.ts';
import { hashBytes, hashUtf8 } from '../portable/hash-content.ts';
import { isToolState } from '../portable/isToolState.ts';
import { listFilesRecursively } from '../portable/listFilesRecursively.ts';
import { readDirNames } from '../portable/readDirNames.ts';
import { readFileIfPresent } from '../portable/readFileIfPresent.ts';
import { statIfPresent } from '../portable/statIfPresent.ts';
import { toPosix } from '../portable/toPosix.ts';
import { composeArtifactId } from '../resolution/composeArtifactId.ts';
import { isArtifactName } from '../resolution/isArtifactName.ts';
import type { Blob } from '../schemas/file-schemas.ts';
import type { RegionKindDeployment, RenderTarget, TreeKindDeployment } from '../schemas/render-target-schemas.ts';
import type { ArtifactId, Hash, KindId, TargetId } from '../schemas/scalar-schemas.ts';

/** One file a target holds that the engine deployed there, and the artifact its position and name recover. */
export interface ClaimedFile {
  /** Posix-separated and relative to the target's root. */
  readonly path: string;
  readonly artifactId: ArtifactId;
  readonly hash: Hash;
  readonly body: Blob;
}

/**
 * One region host as the target holds it now, or the fact that it holds none.
 *
 * `kindId` names the deployment this answers, because two kinds may route into one host and each declares its own
 * markers.
 */
export type HostState =
  | { readonly kindId: KindId; readonly path: string; readonly state: 'absent' }
  | {
      readonly kindId: KindId;
      readonly path: string;
      readonly state: 'present';
      readonly content: string;
      readonly hash: Hash;
      readonly region: RegionClassification;
      /** Empty unless the host carries one well-formed region: nothing may be read out of a damaged one. */
      readonly contributions: ReadonlyArray<Contribution>;
    };

/** What one target holds now of what the engine deployed there, and the digest identifying that state. */
export interface TargetState {
  readonly targetId: TargetId;
  /** Ordered by path. */
  readonly claimed: ReadonlyArray<ClaimedFile>;
  /** Ordered by path then kind, one per region deployment the target declares. */
  readonly hosts: ReadonlyArray<HostState>;
  readonly digest: Hash;
}

/** What reading a target's state needs beyond the target itself. */
export interface ReadTargetStateOptions {
  /** Anchors a target root declared as a relative path. */
  readonly baseDir: string;
}

/**
 * Reads what `target` currently holds of what the engine deployed there.
 *
 * A file is claimed by its shape alone: within a deployment's tree, one whose position and name invert to a slug counts
 * as previously deployed, and the slug with the deployment's kind recovers the artifact it came from. Nothing else
 * identifies it, no record of a previous apply being kept, which is what makes an artifact deleted from every source
 * still classifiable as removed.
 *
 * Three exclusions bound the claim, and each answers a way the rule could take a file that is not the engine's. Names
 * beginning with a dot or an underscore are support content, the rule a source is enumerated by. Within a claimed
 * artifact, only tool state is passed over, the rule that artifact's digest is taken by, so what a source ships and
 * what a destination claims agree. Every declared region host is excluded wherever it falls, since a host is a file the
 * engine does not otherwise own and a tree claim over one would offer it up for deletion.
 *
 * A directory is claimed only when it holds its layout's entry file. A directory bearing an artifact's name and nothing
 * else is somebody else's, and this scan's output is what decides removal.
 *
 * An absent root or host reads as nothing, while anything else rethrows: a permissions fault is not an authoring
 * mistake, and reading one as an absence would offer a whole tree up as removed.
 */
export async function readTargetState(target: RenderTarget, options: ReadTargetStateOptions): Promise<TargetState> {
  const root = expandPath(target.root, options.baseDir);
  const hostPaths = new Set(
    target.deployments.filter((deployment) => deployment.form === 'region').map((deployment) => deployment.host),
  );

  const perTree = await Promise.all(
    target.deployments
      .filter((deployment) => deployment.form === 'tree')
      .map((deployment) => claimTree(root, deployment, hostPaths)),
  );
  const hosts = await Promise.all(
    target.deployments
      .filter((deployment) => deployment.form === 'region')
      .map((deployment) => readHost(root, deployment)),
  );

  const claimed = perTree.flat().toSorted((left, right) => compareStrings(left.path, right.path));
  const ordered = hosts.toSorted((left, right) => {
    const byPath = compareStrings(left.path, right.path);
    return byPath === 0 ? compareStrings(left.kindId, right.kindId) : byPath;
  });

  return { targetId: target.id, claimed, hosts: ordered, digest: digestState(claimed, ordered) };
}

// region | Helpers

/** One file the scan decided belongs to an artifact, before its body is read. */
interface Claim {
  readonly path: string;
  readonly artifactId: ArtifactId;
}

/** Claims every file one tree deployment holds, reading each body once the whole set is known. */
async function claimTree(
  root: string,
  deployment: TreeKindDeployment,
  hostPaths: ReadonlySet<string>,
): Promise<Array<ClaimedFile>> {
  const rootDir = path.join(root, deployment.layout.root);
  const names = (await readDirNames(rootDir)).filter((name) => isArtifactName(name));

  const located = await Promise.all(names.map((name) => locateClaims(rootDir, name, deployment)));
  const claims = located.flat().filter((claim) => !hostPaths.has(claim.path));

  return Promise.all(claims.map((claim) => readClaim(root, claim)));
}

/** Digests a target's state over the sorted path-and-hash pairs of everything it holds, so scan order cannot reach it. */
function digestState(claimed: ReadonlyArray<ClaimedFile>, hosts: ReadonlyArray<HostState>): Hash {
  const byPath = new Map<string, Hash>();
  for (const file of claimed) {
    byPath.set(file.path, file.hash);
  }
  for (const host of hosts) {
    if (host.state === 'present') {
      byPath.set(host.path, host.hash);
    }
  }

  const lines = [...byPath]
    .toSorted(([left], [right]) => compareStrings(left, right))
    .map(([filePath, hash]) => `${filePath}\n${hash}`);
  return hashUtf8(lines.join('\n'));
}

/**
 * Locates the files one entry under a layout root contributes, or none where the entry is not the engine's.
 *
 * A file layout contributes the entry itself, refusing a bare extension as a source enumeration does. A directory
 * layout contributes everything beneath it, an artifact deploying its assets beside the file carrying its frontmatter.
 */
async function locateClaims(rootDir: string, name: string, deployment: TreeKindDeployment): Promise<Array<Claim>> {
  const { layout, kindId, nameTemplate } = deployment;
  const entry = await statIfPresent(path.join(rootDir, name));
  if (entry === undefined) {
    return [];
  }

  if (layout.form === 'file') {
    if (!entry.isFile() || !name.endsWith(layout.extension) || name === layout.extension) {
      return [];
    }
    const slug = invertDeployedName(nameTemplate, name.slice(0, name.length - layout.extension.length));
    return slug === undefined
      ? []
      : [{ path: toPosix(path.join(layout.root, name)), artifactId: composeArtifactId(kindId, slug) }];
  }

  const slug = invertDeployedName(nameTemplate, name);
  const entryFile = await statIfPresent(path.join(rootDir, name, layout.entryFile));
  if (slug === undefined || !entry.isDirectory() || entryFile?.isFile() !== true) {
    return [];
  }

  const artifactId = composeArtifactId(kindId, slug);
  const shipped = await listFilesRecursively(path.join(rootDir, name), { skipName: isToolState });
  return shipped.map((relativePath) => ({
    path: toPosix(path.join(layout.root, name, relativePath)),
    artifactId,
  }));
}

/** Reads one claimed file's body and hash. */
async function readClaim(root: string, claim: Claim): Promise<ClaimedFile> {
  const bytes = await readFile(path.join(root, claim.path));
  return { path: claim.path, artifactId: claim.artifactId, hash: hashBytes(bytes), body: encodeBlob(bytes) };
}

/** Reads one region host, along with the contributions its region carries. */
async function readHost(root: string, deployment: RegionKindDeployment): Promise<HostState> {
  const { host, kindId } = deployment;
  const content = await readFileIfPresent(path.join(root, host));
  if (content === undefined) {
    return { kindId, path: host, state: 'absent' };
  }

  const region = classifyRegion(content, deployment.markers);
  const body = extractRegionContent(content, deployment.markers);
  return {
    kindId,
    path: host,
    state: 'present',
    content,
    hash: hashUtf8(content),
    region,
    contributions:
      body === undefined ? [] : readContributions(body, buildContributionPatterns(deployment.contributionMarkers)),
  };
}

// endregion | Helpers
