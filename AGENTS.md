# Atlas VTT

Rules for working in this repository, for people and for coding tools. This file stays short. What a check can hold belongs in a check; what one part of the code needs belongs in its topic file under `.github/dev/`.

## What this is

An Obsidian plugin: a virtual tabletop for tabletop RPGs. The entry is `main.ts`, the app is under `src/app/`.
PIXI.js v8, imported from the `pixi.js` package, never Obsidian's bundled v7. React 19, zustand, SCSS, strict TypeScript.

## Commands

- `npm ci` installs. Node's version is in `.nvmrc`.
- `npm run check` while you work: typecheck, lint of the files you changed, the unit tests your change reaches, boundaries, file sizes, documentation references, guards. It stops at the first failure.
- `npm run verify` before a pull request: every static check CI runs, and the unit tests.
- `npx vitest run --project unit <file>` runs one test file. A test that needs a DOM starts with `// @vitest-environment jsdom`.
- `vitest.config.mts` has more projects. None runs in CI and none is run whole out of habit; run the files that cover your change:
  - `slow` (generator invariants, grid detection on drawn maps, visibility sweeps, fuzz tests): `npx vitest run --project slow <file>`.
  - `perf` (wall-clock budgets, one worker): `npm run test:perf`.
  - `gpu` (`*.gpu.test.ts`, headless Chromium, needs `npx playwright install chromium` once): `npm run test:gpu -- <name>`.
- `npm run build` builds and copies the plugin into the local vaults it finds. `npm run build:ci` only builds. See `.github/development.md`.

## How rules are enforced

- Conventions are lint rules, `atlas/<name>`, in one table: `scripts/eslint/conventions.mjs`. A finding's message says what to do instead and why. Do that.
- Inline `eslint-disable` comments and `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` are switched off. They fail the gate.
- A rule may be wrong for your case. Then add your file to that rule's `owners` and give the reason in the pull request. The guard check stays red until the maintainer agrees.
- Never raise a baseline: `eslint.suppressions.json`, `scripts/file-sizes.json`, `scripts/bundle-budget.json`. They only shrink. Fix the finding, split the file, or find what grew.
- A source file has at most 300 lines. A fix fits into an old, larger file; a new responsibility gets its own module.
- Imports between layers are checked (`npm run check:boundaries`).

## When a review corrects you

Turn the correction into a check: a convention with a good and a bad example, a type that makes the mistake impossible, or a test. Not a comment, and not a sentence in this file.

## Conventions no check covers yet

- One responsibility per module, function and component.
- Look for an existing helper before you write one: `src/app/utils/`, `src/app/packages/components/primitives/`, `styles/_mixins.scss`.
- Fix within the existing pattern. Add a new pattern only when the old one cannot do it, and remove what the new one replaces.
- Change what was asked for and what it needs. Leave the rest.
- No mock, stub or fake data outside test files.
- Write every function's return type.
- Every text a user reads goes through `t()`. The rules are in [translations](.github/dev/translations.md).
- Style with SCSS classes, Obsidian's CSS variables and the shared mixins. No Tailwind in new code.
- Read the current PixiJS v8 documentation before you write PIXI code. Much of what is written about PIXI is about v7.
- No script files for something that runs once.

## Comments

Write a comment only for a constraint or a reason the code cannot say. None that restates the code, tells what a change did, or marks unfinished work.

## Never without the maintainer

- Rename a stored id. Vault files point at them: built-in preset and condition ids, sense ids, light preset ids, pin icon ids, experimental feature ids, creature filter ids, a resource's `key`, the field keys of built-in statblock templates (`tests/unit/statblocks/presets/builtInSnapshot.test.ts`).
- Raise `ATLAS_VERSION` (`src/app/services/MapPersistence.ts`). An older Atlas loads a map with a higher version empty and saves that over the file.
- Add a network request. The plugin works offline, and every request it makes is disclosed in `README.md` and `PRIVACY.md`.
- Edit a generated file: `CHANGELOG.md`, `src/app/changelog/releases.json`. `npm run changelog:generate` writes them.
- Change the version in `package.json`, `manifest.json` or `versions.json`. Releases are in `.github/development.md`.
- Change a check, its configuration or a workflow without saying why in the pull request.

## Pull requests

- Branch from `beta`, target `beta`. Only promotion pull requests target `main`.
- A change players or GMs notice gets a line in `changelog/Unreleased.md`, in their words.
- Say what you ran and how to see the change in Obsidian. Add a screenshot or a short clip for anything visible.
- Your first pull request needs the signed CLA: see `CONTRIBUTING.md`.

### Contributions written with coding assistants

They are welcome, under the same rules. You understand every line and have tested it. When a tool wrote a large part, say so in the pull request.

## Read before you touch

Each topic file holds what was learned about one part: its rules, the reasons, the mistakes already made. Read the file before you change that part. `npm run check:docs` holds every path these files name to the repository; it cannot check a number or a behaviour. Where a file and the code disagree, the code is right: correct the file in the same change.

| Topic file | Read before touching |
| --- | --- |
| [ui-design](.github/dev/ui-design.md) | any UI: `styles/`, `src/app/packages/components/`, `src/app/toolbar/` |
| [loading-and-skeletons](.github/dev/loading-and-skeletons.md) | loading states, the asset grid, thumbnails: `src/app/packages/components/asset-manager/`, `src/app/packages/components/primitives/` |
| [translations](.github/dev/translations.md) | any text a user reads: `src/app/i18n/` |
| [rendering-and-teardown](.github/dev/rendering-and-teardown.md) | any PIXI code, fog coverage, the player window: `src/app/pixi/`, `src/app/fog/`, `src/app/services/PlayerFrameMirror.ts` |
| [panning](.github/dev/panning.md) | pointer buttons and right-click menus on the canvas: `src/app/pixi/`, `src/app/tools/` |
| [map-images](.github/dev/map-images.md) | map backgrounds, their tiles and cache, the zoom range: `src/app/pixi/mosaicCanvas/` |
| [image-imports](.github/dev/image-imports.md) | converting and importing images: `src/app/imageProcessing/` |
| [universal-vtt-import](.github/dev/universal-vtt-import.md) | `.dd2vtt`, `.uvtt` and `.df2vtt` imports: `src/app/import/uvtt/` |
| [hexagonal-grids](.github/dev/hexagonal-grids.md) | grids, alignment, map stretch, auto-detect: `src/app/grid/`, `src/app/pixi/gridAlignment/`, `src/app/pixi/spectralEngine/` |
| [cell-numbering](.github/dev/cell-numbering.md) | cell numbers and their lattices: `src/app/grid/` |
| [dynamic-lighting](.github/dev/dynamic-lighting.md) | walls, lights, sight, senses, explored memory: `src/app/vision/`, `src/app/lighting/`, `src/app/pixi/lighting/` |
| [experimental-features](.github/dev/experimental-features.md) | feature switches: `src/app/experimental/` |
| [undo-redo-history](.github/dev/undo-redo-history.md) | anything that writes scene state: `src/app/stores/` |
| [token-stacking](.github/dev/token-stacking.md) | the order tokens lie in, drops: `src/app/stores/tokenStacking.ts` |
| [token-resources](.github/dev/token-resources.md) | resources, bars and wheels, the token format on disk: `src/app/resources/`, `src/app/pixi/token-renderer/` |
| [valued-conditions](.github/dev/valued-conditions.md) | conditions that carry a number: `src/app/utils/conditionValues.ts` |
| [initiative](.github/dev/initiative.md) | the tracker, sides, what players see of it: `src/app/initiative/` |
| [3d-dice](.github/dev/3d-dice.md) | 3D dice, their stages, look and cost: `src/app/dice3d/`, `src/app/react/components/dice/` |
| [game-system-presets](.github/dev/game-system-presets.md) | system presets, dice rules and events, collection creation: `src/app/gameSystems/`, `src/app/tools/` |
| [widgets](.github/dev/widgets.md) | widgets and their library: `src/app/services/WidgetSyncService.ts`, `src/app/utils/collectionWidgets.ts` |
| [pin-icons](.github/dev/pin-icons.md) | pin icons: `src/app/types/pinIcons.ts` |
| [creature-filters](.github/dev/creature-filters.md) | the Characters tab, statblock values and limits, search syntax: `src/app/creatures/`, `src/app/search/` |
| [vault-files-and-the-asset-index](.github/dev/vault-files-and-the-asset-index.md) | library files, the asset index, sync, bundles, hashes: `src/app/services/library/`, `src/app/services/vault-sync/`, `src/app/services/collectionBundle/` |
| [moving-and-copying-assets-between-collections](.github/dev/moving-and-copying-assets-between-collections.md) | transfers between collections, scene links: `src/app/services/assetTransfer/` |
| [links-to-atlas-files-in-notes](.github/dev/links-to-atlas-files-in-notes.md) | embeds and links in notes: `src/app/links/` |
| [note-preview-tabs](.github/dev/note-preview-tabs.md) | the note preview window: `src/app/services/detachedNoteLeaf.ts` |
