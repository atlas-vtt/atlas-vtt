# Contributing

1. Create a branch from `beta`. Changes reach `main` only through beta promotion, see [`docs/development.md`](docs/development.md).
2. Make your change. Coding conventions are described in [`CLAUDE.md`](CLAUDE.md); the short version: PIXI.js v8 (not the v7 Obsidian bundles), SCSS with Obsidian CSS variables, explicit return types, files under roughly 300 lines.
3. Run `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build`. Lint must be clean; see [`docs/development.md`](docs/development.md#lint).
4. Open a pull request against `beta` that describes what changed and how you tested it.

## Text and translations

Write every text a user reads or hears with a key: add it to `src/app/i18n/locales/en/` and show it with `t('file.key')`, instead of writing the English into the component. You do not have to translate it; a language that lacks a key shows the English, and translations come as their own pull requests. Keep each sentence one whole text with `{placeholders}`, rather than joining words in code, so it can be worded in languages that decline and order words differently. The rules are in the Translations section of [`CLAUDE.md`](CLAUDE.md#translations).

## Release notes

Add player-facing changes to `changelog/Unreleased.md` as you work. Use **New**, **Improved**, **Fixed**, and **Important changes**; omit empty categories. Describe the behavior a player or GM will notice and where to find new features. Keep test counts and internal refactoring details in the pull request.

Beta builds publish the pending notes as their release notes, so keep `Unreleased.md` current while a beta cycle runs.

When preparing a stable release:

1. Move the pending notes into `changelog/<version>.md`, with the frontmatter shown below, and clear the pending entries from `Unreleased.md`. Keep the release date in `YYYY-MM-DD` format and the metadata values as unquoted single lines.
2. Run `npm version <x.y.z>`; its hook updates `manifest.json` and `versions.json` (beta versions never enter `versions.json`).
3. Run `npm run changelog:generate` and commit both generated files: `CHANGELOG.md` and `src/app/changelog/releases.json`. `npm run changelog:check` detects stale output. Do not edit generated files directly.
4. Run typecheck, tests, `npm run build:ci`, `npm run preflight`, and `npm run release:prepare`. Preparation refuses assets from a stale build and writes `release/release-notes.md` from the same content used in the plugin.
5. Merge the prepared commit into `main`. Run **Prepare Plugin Release** in GitHub Actions on `main` and enter the matching version; the workflow refuses beta versions and commits outside `main`. The workflow validates the selected commit and creates a draft containing the notes and three Obsidian assets. It never publishes automatically. Re-running the same commit refreshes its draft; published releases and drafts from different commits are refused.
6. Inspect the draft and attached assets, then publish it. The tag is the version without a `v` prefix. Do not publish an empty release first.

```markdown
---
version: 0.1.7
date: 2026-09-21
title: A short description of the update
---

## New

- Describe the new capability and how to use it.

## Fixed

- Describe the problem that no longer occurs.
```

Vite regenerates the bundled notes on build and on changelog edits during watch mode. Versions newer than the installed build are excluded. Stable builds exclude `Unreleased.md`; beta builds bundle it as their own headline entry (titled "Coming in x.y.z", without a date) so testers see the pending notes in the app. Release history remains available offline through **Atlas VTT: View changelog** and Atlas settings; ordinary `npm run dev` builds do not auto-announce updates.

The announcement preferences are stored with Atlas settings. **Show changelog after updates** enables announcements; **Feature updates only** filters them to feature releases at any version (such as 0.1 → 0.2 or 1.2 → 1.3), including major-version changes, while skipping patch-only updates (such as 1.2.0 → 1.2.1). Turning the first checkbox off disables automatic announcements while preserving the feature-only preference. Manual history browsing is always available.

Acknowledgment is device/vault-local (`atlas-vtt:changelog` in Obsidian local storage), increases monotonically, and is recorded after the current notes render and the user closes the dialog. Fresh installations establish a baseline silently; existing Atlas data with no acknowledgment gets the current release once. Disabled or filtered updates advance the baseline without opening the modal, so changing the preference does not replay them. Skipping directly across a feature-release boundary still announces the update (for example, 1.2.0 → 1.3.2). Plugin unload and render failures do not acknowledge a displayed release.

Atlas VTT follows the [Obsidian plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines). Changes that add network requests must be disclosed in `README.md` and `PRIVACY.md`.

Contributions are accepted under the repository’s licence, the [GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`), together with the additional permission described in the [README](README.md#credits-and-license).

Before your first pull request can be merged you need to sign the [Contributor License Agreement](CLA.md). The CLA Assistant bot comments on the pull request with the sentence to post; one signature covers all later contributions. You keep the copyright in your work. The agreement lets the maintainer also offer Atlas VTT under other licence terms, and commits him to keeping every version that includes your work open source.
