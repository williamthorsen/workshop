import { describe, expect, it } from 'vitest';

import type { BlobStore } from '../../../portable/createBlobStore.ts';
import { createBlobStore } from '../../../portable/createBlobStore.ts';
import type { FileEntry } from '../../../schemas/file-schemas.ts';
import type { OwnedItemsDeclaration } from '../../../schemas/owned-items-schemas.ts';
import { planOwnedItemsFiles } from '../planOwnedItemsFiles.ts';
import type { TargetPlanContext } from '../TargetPlanContext.ts';

const HOST = 'settings.json';

const hooks: OwnedItemsDeclaration = {
  format: 'json',
  collection: ['hooks'],
  sentinel: { path: ['source'], value: 'codeassembly' },
  host: HOST,
  items: [{ command: 'relay --on=stop' }],
};

// A host holding one foreign hook beside one of the engine's, which is the interleaving no fence could delimit.
const HELD =
  '{\n  "hooks": [\n    {\n      "command": "vendor-tool sync"\n    },\n' +
  '    {\n      "command": "relay --on=stop",\n      "source": "codeassembly"\n    }\n  ]\n}\n';

describe(planOwnedItemsFiles, () => {
  it('plans an added file for a host the target does not hold', () => {
    const { files, bodyOf } = plan({}, [hooks]);

    expect(files.map(({ path, status }) => [path, status])).toStrictEqual([[HOST, 'added']]);
    expect(JSON.parse(bodyOf(files[0]))).toStrictEqual({
      hooks: [{ command: 'relay --on=stop', source: 'codeassembly' }],
    });
  });

  it('reads a host that already holds the declared items as unchanged', () => {
    const { files } = plan({ [HOST]: HELD }, [hooks]);

    expect(files.map(({ path, status }) => [path, status])).toStrictEqual([[HOST, 'unchanged']]);
  });

  it('plans a changed file when a declared item has drifted, leaving the foreign one alone', () => {
    const { files, bodyOf } = plan({ [HOST]: HELD }, [{ ...hooks, items: [{ command: 'relay --on=review' }] }]);

    expect(files[0]?.status).toBe('changed');
    expect(JSON.parse(bodyOf(files[0]))).toStrictEqual({
      hooks: [{ command: 'vendor-tool sync' }, { command: 'relay --on=review', source: 'codeassembly' }],
    });
  });

  it('plans one file for two declarations owning different collections of one host', () => {
    const start = { ...hooks, collection: ['hooks', 'SessionStart'], items: [{ command: 'relay --on=start' }] };
    const stop = { ...hooks, collection: ['hooks', 'Stop'], items: [{ command: 'relay --on=stop' }] };
    const { files, bodyOf } = plan({}, [stop, start]);

    expect(files).toHaveLength(1);
    expect(JSON.parse(bodyOf(files[0]))).toStrictEqual({
      hooks: {
        SessionStart: [{ command: 'relay --on=start', source: 'codeassembly' }],
        Stop: [{ command: 'relay --on=stop', source: 'codeassembly' }],
      },
    });
  });

  it('records every collection it owns in the host, so the plan describes what produced the file', () => {
    const start = { ...hooks, collection: ['hooks', 'SessionStart'] };
    const stop = { ...hooks, collection: ['hooks', 'Stop'] };
    const { files } = plan({}, [stop, start]);

    expect(files[0]?.ownership).toStrictEqual({
      kind: 'entries',
      format: 'json',
      collections: [
        { path: ['hooks', 'SessionStart'], sentinel: hooks.sentinel },
        { path: ['hooks', 'Stop'], sentinel: hooks.sentinel },
      ],
    });
  });

  it('names no contributor, nothing artifact-shaped reaching an entries host', () => {
    const { files } = plan({}, [hooks]);

    expect(files[0]?.contributors).toStrictEqual({ artifacts: [], partials: [] });
  });

  it('blocks a host that will not parse, rather than failing the run', () => {
    const { files } = plan({ [HOST]: '{ not json' }, [hooks]);

    expect(files[0]).toMatchObject({ path: HOST, status: 'unchanged', blocked: { reason: /not valid JSON/ } });
  });

  it('blocks a host whose collection path holds something that is not a collection', () => {
    const { files } = plan({ [HOST]: '{\n  "hooks": "off"\n}\n' }, [hooks]);

    expect(files[0]?.blocked?.reason).toMatch(/other than a collection/);
  });

  describe('a declaration owning no items', () => {
    it('withdraws the engine’s items and prunes the collection it empties', () => {
      const held =
        '{\n  "hooks": [\n    {\n      "command": "relay --on=stop",\n      "source": "codeassembly"\n    }\n  ]\n}\n';
      const { files, bodyOf } = plan({ [HOST]: held }, [{ ...hooks, items: [] }]);

      expect(files[0]?.status).toBe('changed');
      expect(JSON.parse(bodyOf(files[0]))).toStrictEqual({});
    });

    it('leaves a collection still holding foreign items standing, with those alone', () => {
      const { files, bodyOf } = plan({ [HOST]: HELD }, [{ ...hooks, items: [] }]);

      expect(JSON.parse(bodyOf(files[0]))).toStrictEqual({ hooks: [{ command: 'vendor-tool sync' }] });
    });

    it('plans nothing for a host holding none of the engine’s items', () => {
      expect(plan({ [HOST]: '{\n  "hooks": []\n}\n' }, [{ ...hooks, items: [] }]).files).toStrictEqual([]);
    });

    it('plans nothing for a host the target does not hold', () => {
      expect(plan({}, [{ ...hooks, items: [] }]).files).toStrictEqual([]);
    });
  });
});

// region | Helpers

/** Plans the owned-items files of a target holding `held`, with a reader for each planned body. */
function plan(
  held: Record<string, string>,
  declarations: ReadonlyArray<OwnedItemsDeclaration>,
): { files: Array<FileEntry>; bodyOf: (file: FileEntry | undefined) => string } {
  const blobs = createBlobStore();
  const context: TargetPlanContext = {
    targetId: 'claude',
    blobs,
    artifactsByKind: new Map(),
    renders: new Map(),
    assets: new Map(),
    claimed: new Map(),
    hosts: new Map(),
    ownedHosts: new Map(
      Object.entries(held).map(([path, content]) => [path, { path, state: 'present', content, hash: path }] as const),
    ),
    resolveDeployedName: () => undefined,
  };

  return { files: planOwnedItemsFiles(context, declarations), bodyOf: (file) => readBody(blobs, file) };
}

/** Reads the planned body of `file`, failing the test when the store contains none. */
function readBody(blobs: BlobStore, file: FileEntry | undefined): string {
  const blob = file?.planned === undefined ? undefined : blobs.toTable()[file.planned.hash];
  if (blob === undefined) {
    throw new Error(`No planned body was registered for "${file?.path ?? 'a file that was never planned'}".`);
  }
  return blob.data;
}

// endregion | Helpers
