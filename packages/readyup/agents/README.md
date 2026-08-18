# Authoring readyup's agent guidance

This directory is a CodeAssembly content root, declared by the `codeassembly.content` key in `packages/readyup/package.json`.

## Why the rulebook delivers as a skill

`guidance/rulebooks/readyup-kits.md` carries `delivery: skill`, so CodeAssembly renders it as a `consult-readyup-kits` skill in each consuming repo rather than injecting its body at launch.

Ambient delivery fails here on three counts:

- **Relevance rate.** nmr's ambient cheatsheet is paid on every task and repays it, because `nmr` is invoked in nearly every session. Kit authoring is episodic: a consuming repo writes its kit once, extends it a few times a year, and runs `rdy` in CI forever.
- **Compression.** An ambient body has to stay a cheatsheet. The worked-cases table is what makes the skip rule land, and a cheatsheet cannot carry it.
- **Duplication.** Harnesses list installed skills by name and description, so a skill's description already occupies the ambient slot. Delivering ambient as well would pay twice for one signal.

Both modes require the consumer to run `codeassembly sync`, so the choice costs nothing in adoption.

## Constraints on the rulebook body

A rulebook may link only into `skills/` and `scripts/`. Every other relative Markdown target is rejected, a path into `node_modules/` included: it resolves under `guidance/rulebooks/` and reports as a rulebook that should have been invoked rather than linked. Name a path outside those trees in a code span instead of a link.

Anchor-only links are checked against the body they appear in, so a fragment naming a heading in `packages/readyup/README.md` fails the run. Check `](#` before moving a section between the two.

## Publishing

The directory is published because `files` in `packages/readyup/package.json` lists it. Dropping that entry fails nothing locally, because this repo resolves the guidance through a `workspace:*` self-link that `files` does not govern. `src/__tests__/packaging.tool.test.ts` is what catches it.

## Gating

The repo root's `check:content` script runs `codeassembly validate` over this directory and hangs off `check:strict:post`, so a defect here fails this repo's build rather than the next consumer's install.
