# Development and pull requests

Atlas has two long-lived branches:

| Branch | Channel | Version format | Who gets it |
| --- | --- | --- | --- |
| `beta` | Beta builds for QA | `x.y.z-beta.N` | Maintainer and contributors through [BRAT](beta-testing.md) |
| `main` | Stable releases | `x.y.z` | Everyone through the Obsidian community directory |

Work lands on `beta` first. Create a branch from `beta`, make your change and
open a pull request against `beta`. Only promotion pull requests target `main`.

CI enforces the channel: a pull request or push to `main` fails if the manifest
version has a beta suffix, and one to `beta` fails if it does not. Obsidian's
community directory reads `manifest.json` from `main` and installs the release
tagged with that version, and GitHub never marks a pre-release as *latest*, so
beta builds are unreachable from production installs.

## Local checks

```sh
npm ci
npx tsc --noEmit
npm run lint
npx vitest run --project unit
npm run build:ci
npm run preflight
npm run release:prepare
```

`build:ci` builds without copying files into a local vault. CI runs these checks
and every one of them blocks the merge, lint included.

### Tests

Unit tests run in Node. A test that needs a DOM (React, `document`, canvas
elements) starts with `// @vitest-environment jsdom`; without it, it fails with
`document is not defined`. Keep that line off tests that do not need it: jsdom
adds about 0.4 s of CPU to every file that loads it.

A test pays for every module its imports reach. Code that only looks for open
maps reads `ATLAS_VIEW_TYPE` and `isAtlasView` from `atlasViewType.ts`, never
the map view itself, which loads the whole app. `npm run test:gpu` runs the
browser tests, locally only.

### Lint

`npm run lint` runs `eslint-plugin-obsidianmd`, the rule set Obsidian's community
directory scores the plugin with, so a lint finding is a public review finding.
The gate is zero tolerance: no errors, no warnings (`--max-warnings 0`).

- Fix a finding where it starts, usually a declaration typed `any`. Do not run
  `eslint --fix` across the tree.
- Inline `eslint-disable` comments are switched off (`noInlineConfig`) and fail
  the gate. `@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are errors
  (`ban-ts-comment`).
- The one accepted exception, the `Function` constructor that runs Fantasy
  Statblocks layout callbacks (see [PRIVACY.md](../PRIVACY.md)), is recorded in
  `eslint.suppressions.json`. A suppression covers a rule, in a file, up to a
  count, so a second occurrence anywhere still fails. Adding an entry is a
  maintainer decision and needs its reason in the pull request. Obsidian's
  scorecard does not read this file and keeps listing suppressed findings.
- When a suppressed finding is fixed, ESLint fails until the stale entry is
  removed: `npx eslint . --suppressions-location eslint.suppressions.json --prune-suppressions`.
  The file deliberately does not use ESLint's default name: Obsidian's
  directory review runs ESLint with its own rule set, and a suppression that
  set does not use makes ESLint exit with code 2, which the review reports as
  a fatal error.

### Workflow conventions

Actions are pinned to a full commit SHA with the version in a trailing comment;
Dependabot (`.github/dependabot.yml`) opens weekly pull requests against `beta`
that move the pins and group minor and patch npm updates. Checkouts do not
persist credentials, workflows declare the minimum `permissions`, and the Node
version comes from `.nvmrc`. Pull requests also run a dependency review that
fails on a newly added dependency with a known vulnerability of moderate
severity or higher.

## Test builds

Plugin CI tests and builds every commit once. Its checks run as parallel jobs
(static checks, the directory scan, the unit suite split over four runners), and
`build-plugin`, the required check, fails when any of them failed and otherwise
builds the plugin. Successful runs attach an `atlas-vtt-<commit>` artifact
containing `main.js`, `manifest.json`, `styles.css` and the release notes,
retained for 14 days for pull requests and 90 days for pushes to `beta` and
`main`, whose builds are the ones released. For pull requests, `<commit>` is the
PR head commit, but the build itself is that commit merged into the current base
branch, so it may include base changes that are not in the branch. Install these files in an isolated test vault's
`.obsidian/plugins/atlas-vtt/` directory and reload the plugin. Include practical
Obsidian test steps for interaction changes. These artifacts do not publish a
release or bump the version.

## Beta builds

Every push to `beta` runs Plugin CI to the end (pushes are never cancelled by
a later push). When all its checks pass and the manifest carries a beta version
that has not been published yet, its `publish-beta` job takes that run's build,
attests its provenance and publishes it as a GitHub **pre-release** tagged with
that version, with `changelog/Unreleased.md` as its notes. Nothing is built
again for the release. Pushes that do not bump the version publish nothing and
the job stays green. A push that sets the version to one already tagged on
another commit fails the job. To publish again after a failure, re-run the
failed jobs of that Plugin CI run.

To cut a new beta after merging into `beta`:

```sh
git checkout beta && git pull
npm version prerelease --preid beta   # 0.2.0-beta.1 -> 0.2.0-beta.2
git push --follow-tags
```

To start the beta cycle for a new target version use
`npm version preminor --preid beta` (or `prepatch` / `premajor`). Testers
install and update through BRAT as described in [beta-testing.md](beta-testing.md).

## Promoting a beta to a stable release

1. Branch from `beta`: `git checkout -b release/0.2.0 beta`.
2. Move the pending notes from `changelog/Unreleased.md` into
   `changelog/0.2.0.md`, run `npm run changelog:generate` and commit.
3. `npm version 0.2.0` (this also updates `versions.json`) and push the branch.
4. Open a pull request against `main`. CI verifies the stable version.
5. After merging, wait for Plugin CI on the `main` push to pass, then run
   **Prepare Plugin Release** on `main`, review the draft and publish it. See
   [releasing-obsidian-plugin.md](releasing-obsidian-plugin.md).
6. Merge `main` back into `beta` and start the next beta cycle with
   `npm version preminor --preid beta`.

## Review and merge

Pull requests require a green `build-plugin` check and an up-to-date branch;
`main` additionally requires the `atlas/pr-review` check. Automated review is
provided by a private maintainer-managed service. Drafts are not automatically
reviewed; external contributions require manual maintainer review. If the review
status reports an error, contact the maintainer rather than bypassing or
weakening CI.

The maintainer decides which fixes to implement, when to merge, and when to
publish a release. Stable releases continue through the Prepare Plugin Release
workflow, which refuses beta versions and commits that are not on `main`.
