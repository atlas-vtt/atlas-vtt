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

The suite is two projects. `unit` runs in CI on every push and pull request, in four
shards. `slow` holds the files that take a CI runner ten seconds or more each (the dungeon
generator's invariants, the Spectral Engine on drawn maps, visibility sweeps, wall sealing,
property and fuzz tests; the list is `SLOW_TEST_FILES` in `vitest.config.mts`) and never
runs in CI: run `npm run test:slow` locally when the code those files cover changes, or
one file of it with `npx vitest run --project slow <path>`.

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
- Atlas' own conventions are named rules, `atlas/<name>`, defined in
  `scripts/eslint/conventions.mjs`. A rule's message says what to do instead
  and why, and every rule has examples of code it accepts and code it
  rejects, which the unit suite runs.
- `eslint.suppressions.json` is the baseline. It holds the one accepted
  exception, the `Function` constructor that runs Fantasy Statblocks layout
  callbacks (see [PRIVACY.md](../PRIVACY.md)), and the findings that existed
  when a rule was switched on. A suppression covers a rule, in a file, up to a
  count, so one more occurrence anywhere still fails. Counts only go down:
  fix a baselined finding when you work on its code, and never add to the
  file. Adding an entry is a maintainer decision and needs its reason in the
  pull request. Obsidian's scorecard does not read this file and keeps listing
  suppressed findings.
- A fixed finding leaves a count that is too high, which does not fail the
  gate (`--pass-on-unpruned-suppressions`); the maintainer removes such
  entries when the change lands, with `npm run lint:prune`. A rule that is
  newly switched on is baselined by the maintainer alone:
  `npx eslint . --suppressions-location eslint.suppressions.json --suppress-rule <rule id>`.
  The file deliberately does not use ESLint's default name: Obsidian's
  directory review runs ESLint with its own rule set, and a suppression that
  set does not use makes ESLint exit with code 2, which the review reports as
  a fatal error.

### Guards

Three records say how far the code is from where it should be, and each of
them may only shrink:

- **Lint baseline**: `eslint.suppressions.json`, above.
- **File sizes**: a source file (`main.ts` and `src/**/*.ts`, `*.tsx`, without
  tests and declarations) has at most 300 lines. The files that were larger
  when the check came are recorded in `scripts/file-sizes.json` with an
  allowance, their size rounded up to the next 50 lines: a fix fits, a new
  responsibility does not and goes into its own module. Tables of pure data
  are exempt by glob (the translations). `npm run check:sizes` checks, and
  `node scripts/check-file-sizes.mjs --update` lowers the allowances of files
  that shrank. Adding an entry or raising one is the maintainer's alone:
  `node scripts/check-file-sizes.mjs --record <file>`.
- **Bundle budget**: `scripts/bundle-budget.json` holds how many bytes
  `dist/main.js` and `dist/styles.css` may have, and `npm run preflight` fails
  a build above it. Find what grew before asking for a higher budget.

`node scripts/check-guards.mjs --base <ref>` compares the three with what they
were at `<ref>` and fails when a rule's suppressed findings, an allowance or a
budget rose, or a rule, an entry or an exemption was added. A suppressed
finding that moved to another file is no rise. For pull requests from forks CI
runs the base branch's copy of it with `--strict`, which also fails when the
checks themselves changed: the ESLint configs and rules, the check scripts,
the TypeScript and Vitest configs, the workflows and the `scripts` of
`package.json`. The step makes such a change loud; it does not forbid it. Say
in the pull request why it is needed, and the maintainer labels it
`guards-ok`, which skips the step from the next push on. On the maintainer's
own branches `ATLAS_GUARDS_OK=1` turns the failures into notes.

`npm run check` is the loop while working: typecheck, ESLint on the files
changed since the branch left `beta`, the unit tests those changes reach, then
boundaries, file sizes, documentation references and the guards. It prints
each command, stops at the first that fails, skips the tests with
`npm run check -- --no-tests` and takes another base from `ATLAS_BASE`.
`npm run verify` is the whole gate before a pull request: typecheck, lint,
release notes, boundaries, file sizes, documentation references and the unit
suite.

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
retained for 14 days for pull requests and 90 days for pushes to `beta`,
`release/*` and `main`; those of `beta` and `release/*` are the ones released. For pull requests, `<commit>` is the
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
4. Open a pull request against `main`. CI verifies the stable version, and
   **Release Gate** fails until the release is published.
5. Wait for Plugin CI on the push of the branch to pass, then run **Prepare
   Plugin Release** on `release/0.2.0`, review the draft and publish it. Merge
   the pull request right after that, with a merge commit. See
   [releasing-obsidian-plugin.md](releasing-obsidian-plugin.md).
6. Merge `main` back into `beta` and start the next beta cycle with
   `npm version preminor --preid beta`.

## Review and merge

Pull requests require a green `build-plugin` check and an up-to-date branch;
`main` additionally requires the `release-published` check, and these hold for
administrators too. External contributions require manual maintainer review.

The maintainer decides which fixes to implement, when to merge, and when to
publish a release. Stable releases continue through the Prepare Plugin Release
workflow, which refuses beta versions and anything but the version's release
branch.
