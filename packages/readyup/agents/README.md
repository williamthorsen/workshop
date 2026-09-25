# Authoring readyup's agent guidance

This directory is a CodeAssembly content root, declared by the `codeassembly.content` key in `packages/readyup/package.json`.

## Why CodeAssembly delivers the rulebook as a skill

`guidance/rulebooks/readyup-kits.md` declares `delivery: skill`, so CodeAssembly renders it as a `consult-readyup-kits` skill in each consuming repo rather than injecting its body at launch.

Ambient delivery fails here on three counts:

- **Relevance rate.** nmr's ambient cheatsheet loads on every task and is relevant to nearly all of them, because `nmr` is invoked in nearly every session. Kit authoring is episodic: A consuming repo writes its kit once, extends it a few times a year, and runs `rdy` in CI forever.
- **Compression.** An ambient body has to stay a cheatsheet. The worked-cases table makes the skip rule clear, and a cheatsheet has no room for it.
- **Duplication.** Harnesses list installed skills by name and description, so a skill's description already occupies the ambient slot. Delivering ambient as well would state one signal twice.

The choice changes nothing about adoption: Both modes require the consumer to run `codeassembly sync`.

## Constraints on the rulebook body

A rulebook may link only into `skills/` and `scripts/`. Every other relative Markdown target is rejected, a path into `node_modules/` included: `codeassembly validate` resolves it under `guidance/rulebooks/` and reports it as a rulebook that should have been invoked rather than linked. Name a path outside those trees in a code span instead of a link.

Anchor-only links are checked against the body in which they appear, so a fragment naming a heading in `packages/readyup/README.md` or in a file under `packages/readyup/docs/` fails the run. Check `](#` before moving a section between the rulebook and either.

## Publishing

The directory is published because `files` in `packages/readyup/package.json` lists it. Dropping that entry fails nothing locally, because this repo resolves the guidance through a `workspace:*` self-link that `files` does not govern. `src/__tests__/packaging.tool.test.ts` catches it.

## Gating

The repo root's `check:content` script runs `codeassembly validate` over this directory and runs as part of `check:strict:post`, so a defect here fails this repo's build rather than the next consumer's install.
