import { ensureOwnedItems } from '../../ownership/structured/ensureOwnedItems.ts';
import { removeOwnedItems } from '../../ownership/structured/removeOwnedItems.ts';
import { appendTo } from '../../portable/appendTo.ts';
import type { FileContributors, FileEntry, FileOwnership, FileSide } from '../../schemas/file-schemas.ts';
import type { OwnedItemsDeclaration } from '../../schemas/owned-items-schemas.ts';
import { blockAtCurrent, classifyStatus } from './file-entries.ts';
import type { TargetPlanContext } from './TargetPlanContext.ts';

/**
 * Plans the files a target's owned-items declarations write: one per host, whatever the declarations name it.
 *
 * One file rather than one per declaration, because a host is one destination and the plan keys destinations by path.
 * Two declarations owning different collections of one `settings.json` therefore compose over the same body in turn,
 * and the second sees what the first produced.
 *
 * A host holding none of the engine's items, with nothing declared to put there, yields no entry: the engine has
 * neither content there nor items to take away, which is the rule a region host with nothing routed to it follows.
 * A declaration owning no items is the withdrawal, and it prunes the structure it empties rather than leaving an empty
 * collection standing.
 *
 * The contributors are empty on both sides. Nothing artifact-shaped reaches an entries host: what a target owns there
 * is a function of the target rather than of the artifacts a config selects, and naming one would invent provenance.
 */
export function planOwnedItemsFiles(
  context: TargetPlanContext,
  declarations: ReadonlyArray<OwnedItemsDeclaration>,
): Array<FileEntry> {
  const byHost = new Map<string, Array<OwnedItemsDeclaration>>();
  for (const declaration of declarations) {
    appendTo(byHost, declaration.host, declaration);
  }

  return byHost
    .entries()
    .flatMap(([host, owned]) => {
      // Collection-path order, so reordering the declarations cannot move the body they compose to.
      const ordered = owned.toSorted((left, right) => comparePaths(left.collection, right.collection));
      const entry = planHost(context, host, ordered);
      return entry === undefined ? [] : [entry];
    })
    .toArray();
}

// region | Helpers

/** Nothing artifact-shaped contributes to an entries host, which the file schema admits for generated content. */
const NO_CONTRIBUTORS: FileContributors = { artifacts: [], partials: [] };

/** Orders two collection paths segment by segment, so a fold order follows the declarations rather than their order. */
function comparePaths(left: ReadonlyArray<string>, right: ReadonlyArray<string>): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const order = (left[index] ?? '').localeCompare(right[index] ?? '');
    if (order !== 0) {
      return order;
    }
  }
  return left.length - right.length;
}

/**
 * Describes the ownership the plan records for a host: its format, and every collection the engine owns items in.
 *
 * The format comes from the first declaration, `assertRenderTargetsAreConsistent` having established that every
 * declaration on one host agrees about it, a single file having one.
 */
function describeOwnership(declarations: ReadonlyArray<OwnedItemsDeclaration>): FileOwnership {
  const [first] = declarations;
  return {
    kind: 'entries',
    format: first?.format ?? 'json',
    collections: declarations.map(({ collection, sentinel }) => ({ path: collection, sentinel })),
  };
}

/** Composes one host's body by running each declaration over what the last one produced. */
function planHost(
  context: TargetPlanContext,
  host: string,
  declarations: ReadonlyArray<OwnedItemsDeclaration>,
): FileEntry | undefined {
  const held = context.ownedHosts.get(host);
  const heldContent = held?.state === 'present' ? held.content : undefined;
  const current: FileSide | undefined = heldContent === undefined ? undefined : context.blobs.addUtf8(heldContent);
  const ownership = describeOwnership(declarations);

  let content = heldContent ?? '';
  for (const declaration of declarations) {
    const outcome =
      declaration.items.length === 0
        ? removeOwnedItems(content, declaration)
        : ensureOwnedItems(content, declaration, declaration.items);
    if ('blocked' in outcome) {
      return blockAtCurrent({
        targetId: context.targetId,
        path: host,
        ownership,
        contributors: NO_CONTRIBUTORS,
        reason: outcome.blocked.reason,
        current,
      });
    }
    content = outcome.content;
  }

  // Declarations owning nothing that changed nothing found nothing of the engine's here, so there is no file to show.
  if (declarations.every((declaration) => declaration.items.length === 0) && content === (heldContent ?? '')) {
    return undefined;
  }

  const planned = context.blobs.addUtf8(content);
  return {
    targetId: context.targetId,
    path: host,
    status: classifyStatus(current, planned),
    ownership,
    ...(current !== undefined && { current }),
    planned,
    contributors: NO_CONTRIBUTORS,
  };
}

// endregion | Helpers
