# Atlas VTT

Rules for working in this repository, for people and for coding tools. This file stays short. What a check can hold belongs in a check, and the reason for a piece of code belongs in a comment on that code. There is no other description of the code: where you need to know how a part works, read it.

## What this is

An Obsidian plugin: a virtual tabletop for tabletop RPGs. The entry is `main.ts`, the app is under `src/app/`.
PIXI.js v8, imported from the `pixi.js` package, never Obsidian's bundled v7. React 19, zustand, SCSS, strict TypeScript.

## Commands

- `npm ci` installs. Node's version is in `.nvmrc`.
- `npm run check` while you work: typecheck, both lints of the files you changed, the unit tests your change reaches, boundaries, file sizes, documentation references, guards. It stops at the first failure.
- `npm run verify` before a pull request: typecheck, lint, the lint of the tests, release notes, boundaries, file sizes, documentation references and the unit tests. The directory scan (`npm run lint:scan`), the release channel check, the reporting service's tests, the build and its preflight run only in CI.
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
- Never raise a baseline: `eslint.suppressions.json`, `eslint.tests.suppressions.json`, `scripts/file-sizes.json`, `scripts/bundle-budget.json`. They only shrink. Fix the finding, split the file, or find what grew.
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
- Every text a user reads goes through `t()`. The rules are in [`CONTRIBUTING.md`](CONTRIBUTING.md#text-and-translations).
- Style with SCSS classes, Obsidian's CSS variables and the shared mixins. No Tailwind in new code.
- Read the current PixiJS v8 documentation before you write PIXI code. Much of what is written about PIXI is about v7.
- No script files for something that runs once.

## Tests

- A test must be able to fail: it asserts what the code did, never a value against itself and never a mock's own answer.
- Use the real module where it is pure, and the shared `tests/mocks/obsidian.ts` instead of an inline mock of `obsidian`. A file that needs more than six `vi.mock` tests its mocks.
- `npm run lint:tests` holds this (`atlas/test-<name>`, `scripts/eslint/testConventions.mjs`), with its own baseline.

## Comments

Write a comment only for a constraint or a reason the code cannot say. None that restates the code, tells what a change did, or marks unfinished work.

## Never without the maintainer

- Rename or remove a stored id. Files in users' vaults name them. Tests hold the lists (`tests/unit/storedIds/`, and beside their subject for senses, light presets, dice sets and statblock templates); a failing one says what to do.
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
