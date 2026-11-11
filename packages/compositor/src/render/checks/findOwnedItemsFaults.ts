import type { Violation } from '../../consistency/Violation.ts';
import { allowsStamping, findStampFault, hasSentinel } from '../../ownership/structured/sentinel.ts';
import type { OwnedItemsDeclaration } from '../../schemas/owned-items-schemas.ts';
import type { RenderTarget } from '../../schemas/render-target-schemas.ts';
import { findHostCollisions } from './findHostCollisions.ts';
import { findRepeats } from './findRepeats.ts';

/**
 * Reports an owned-items declaration that contends for a collection another already owns or nests inside, disagrees
 * with a sibling about its host's format, sits on a region host or where a tree layout needs a directory, or has an
 * item its sentinel could never write or find again.
 */
export function findOwnedItemsFaults(target: RenderTarget, at: string): Array<Violation> {
  const ownedItems = target.ownedItems ?? [];
  const violations = findRepeats(
    ownedItems.map((declaration) => `${declaration.host} at ${declaration.collection.join('.')}`),
    `${at}.ownedItems`,
    'owns',
  );
  const regionHosts = new Set(
    target.deployments.filter((deployment) => deployment.form === 'region').map((deployment) => deployment.host),
  );

  const formatsByHost = new Map<string, string>();
  for (const [position, declaration] of ownedItems.entries()) {
    const ownedAt = `${at}.ownedItems[${position}]`;
    violations.push(
      ...findHostCollisions(declaration.host, target.deployments, `${ownedAt}.host`),
      ...findNestedCollections(declaration, ownedItems.slice(0, position), ownedAt),
    );
    const declaredFormat = formatsByHost.get(declaration.host);
    if (declaredFormat === undefined) {
      formatsByHost.set(declaration.host, declaration.format);
    } else if (declaredFormat !== declaration.format) {
      violations.push({
        path: `${ownedAt}.format`,
        message: `is "${declaration.format}" where the same host is declared "${declaredFormat}", and a file has one`,
      });
    }
    if (regionHosts.has(declaration.host)) {
      violations.push({
        path: `${ownedAt}.host`,
        message: 'is also a region host, so two mechanisms would each compute the whole file',
      });
    }
    violations.push(...findUnmarkableItems(declaration, ownedAt));
  }

  return violations;
}

// region | Helpers

/**
 * Reports a declared collection path that nests inside one an earlier declaration on the same host already owns.
 *
 * A collection is an array, and no key descends through an array, so a path and a prefix of it cannot both name one.
 * The fold runs the outer declaration first and the inner one then refuses; on a host the target does not yet hold,
 * that refusal produces no entry at all, nothing standing there for it to be recorded on.
 */
function findNestedCollections(
  declaration: OwnedItemsDeclaration,
  earlier: ReadonlyArray<OwnedItemsDeclaration>,
  path: string,
): Array<Violation> {
  const other = earlier.find(
    (candidate) => candidate.host === declaration.host && nestsWithin(declaration.collection, candidate.collection),
  );
  if (other === undefined) {
    return [];
  }
  return [
    {
      path: `${path}.collection`,
      message: `nests with "${other.collection.join('.')}" on the same host, and no key descends through a collection`,
    },
  ];
}

/**
 * Reports a declared item the declaration's own sentinel could never reach.
 *
 * The two branches fault differently and both are decidable from the declaration alone. A sentinel the engine cannot
 * write needs the item to have the mark already, so one that does not could never be found again. A sentinel it can
 * write needs somewhere to write it, and an item that is not a mapping the path descends through offers none.
 * Detecting both here turns what would otherwise throw at the first host the declaration was run over into a located
 * authoring fault, reported beside every other mistake in the declarations.
 */
function findUnmarkableItems(declaration: OwnedItemsDeclaration, path: string): Array<Violation> {
  const stamps = allowsStamping(declaration.sentinel);
  const violations: Array<Violation> = [];

  for (const [position, item] of declaration.items.entries()) {
    const at = `${path}.items[${position}]`;
    if (!stamps) {
      if (!hasSentinel(item, declaration.sentinel)) {
        violations.push({
          path: at,
          message: 'does not have the sentinel, which this declaration cannot write, so it could never be found again',
        });
      }
      continue;
    }
    const reason = findStampFault(item, declaration.sentinel);
    if (reason !== undefined) {
      violations.push({ path: at, message: reason });
    }
  }

  return violations;
}

/**
 * Reports whether either path is a strict prefix of the other, the two then naming a collection and something inside it.
 *
 * Two identical paths are the repeat check's, so they read as no nesting here and one fault reports one message.
 */
function nestsWithin(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  if (left.length === right.length) {
    return false;
  }
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

// endregion | Helpers
