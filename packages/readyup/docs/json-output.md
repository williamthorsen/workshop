# JSON output

`run`, `compile`, `list`, and `verify` accept `--json`; `init` does not. With `--json`, stdout contains exactly one JSON document and every human-readable line goes to stderr. `--help` and `--version` have no JSON form.

## Published schemas

Each payload is specified by a JSON Schema published with the package and includes an integer `schemaVersion` matching the `vN` in its filename.

| Payload        | Import path                              |
| -------------- | ---------------------------------------- |
| `compile`      | `readyup/schemas/compile.v1.json`        |
| error envelope | `readyup/schemas/error-envelope.v1.json` |
| `list`         | `readyup/schemas/list.v1.json`           |
| `run` report   | `readyup/schemas/report.v1.json`         |
| `verify`       | `readyup/schemas/verify.v1.json`         |

Each `$id` is the same path under `https://unpkg.com/readyup/`. The schemas are generated from the definitions from which the exported `Json*` types derive, so the published contract and the types cannot drift apart.

Each document names its payload under `$defs` and points at it from a root `$ref`, so a document is shaped `{ $schema, $id, $ref, $defs }` and the payload's own `required` and `properties` are under `$defs` rather than at the root. A validator resolves the `$ref` and needs nothing further; code reading the document directly has to follow it.

## Evolution policy

The five payloads are versioned independently.

- **Adding an optional field does not bump `schemaVersion`.** A validator pinned to `v1` keeps accepting payloads from a later ReadyUp.
- **Removing, renaming, or re-typing a field does bump it**, publishing a new `vN` beside the old. Widening a closed set counts as re-typing.
- **A field is `required` only when every payload has it.** Omission is reserved for absent or empty data.
- **`warnings[].code` is an open set**, exempt from the widening rule. Consumers must tolerate an unknown code, displaying its `message` and `remedy`. `error.code` stays closed.
- **`schemaVersion` covers the payload's fields, not how the document expresses them.** The generator decides where a keyword appears, so resolve a `$ref` with a validator rather than reading a keyword from a fixed path.

## Error envelope

An invocation that fails before producing anything else emits:

```json
{ "schemaVersion": 1, "error": { "code": "usage", "message": "Unknown option '--bogus'" } }
```

`code` is one of `usage`, `config`, `kit-load`, or `internal`. The envelope covers only failures preceding dispatch; once the run reaches its kits, a failing kit is reported inside the report:

```json
{ "name": "release", "error": { "code": "kit-load", "message": "Cannot find .readyup/kits/release.js" } }
```

An error entry has no counts and no verdict, and the top-level totals cover only the kits that ran.

An error body may also include `hint`, one action that would clear the failure:

```json
{
  "schemaVersion": 1,
  "error": {
    "code": "config",
    "message": "No manifest found at https://raw.githubusercontent.com/acme/private/HEAD/.readyup/manifest.json.",
    "hint": "If the repository is private, set GITHUB_TOKEN or run `gh auth login`."
  }
}
```

`hint` is optional and absent when nothing useful can be suggested. It never duplicates text already in `message`, so a consumer can present the two separately. Human output renders it on a line of its own, prefixed `💡 Hint:` under the rich style and `Hint:` under plain.

## The run report

```json
{
  "schemaVersion": 1,
  "readyupVersion": "0.22.0",
  "passed": false,
  "counts": { "passed": 4, "errors": 1, "warnings": 0, "recommendations": 0, "blocked": 2, "optional": 1 },
  "worstSeverity": "error",
  "detail": "full",
  "durationMs": 68,
  "kits": [
    {
      "name": "deploy",
      "compiledWith": "0.21.0",
      "passed": false,
      "counts": {},
      "worstSeverity": "error",
      "failOn": "error",
      "reportOn": "recommend",
      "durationMs": 68,
      "checklists": []
    }
  ]
}
```

- **`passed`** is the run verdict, agreeing with exit code 0 in every case. Kit and checklist entries have their own.
- **`counts`** contains the six tallies at report, kit, and checklist level, nested so count names and verdict names share no namespace.
- **`worstSeverity`** is derived verdict data, omitted when nothing failed.
- **`failOn`** and **`reportOn`** appear at the top level only when the corresponding flag was passed, and on every kit that ran as the value that governed it. See [thresholds](concepts.md#thresholds) for how each resolves.
- **`compiledWith`** names the readyup that built a kit's bundle. It appears on every kit whose bundle records one, including when that version matches the report's own `readyupVersion`, and is absent for a bundle compiled before readyup recorded it and for a kit run from source under `--jit`. `rdy verify`'s [`rebuildCompiledWith`](publishing-kits.md#verifying-by-recompiling) reports the same value under a narrower rule, appearing only when it disagrees with the running readyup: That field explains a mismatch, this one records what ran.
- **`warnings`** lists any advisory as `{ code, message, remedy? }`, absent when none was raised.

Payloads are slim by construction: An empty field is omitted rather than emitted as `null`, empty `checks` arrays are dropped, and `fix` appears only on failed checks.

## Detail level

`--detail summary` keeps counts, verdicts, and worst severity but reduces the detail tree to failed checks and their fixes -- the shape that an agent needs, at a fraction of the tokens. `--detail full` is the default.

Both projections are described by `report.v1.json`, and the report's own `detail` field names which one was received. Passing `--detail` without `--json`, or to any command other than `run`, is a usage error.
