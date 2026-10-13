# Releasing Atlas VTT

## Cut a release

Stable releases come from `main` only. Beta work is promoted first as described in [development.md](development.md#promoting-a-beta-to-a-stable-release).

1. On the promotion branch, `npm version <x.y.z>`. This bumps `package.json`, `manifest.json` and `versions.json` together and creates a git tag. `.npmrc` sets an empty tag prefix, so the tag equals the manifest version exactly (`0.1.1`, not `v0.1.1`), which Obsidian requires.
2. Merge into `main`, then run **Prepare Plugin Release** on `main` with that version. The workflow refuses beta versions and commits that are not on `main`, repeats every check, attests build provenance and creates a draft release with `main.js`, `manifest.json` and `styles.css` as individual assets.
3. Review the draft and publish it.

Obsidian installs exactly those three files. Anything the plugin needs at runtime (sounds, images) must be inlined into `main.js` or `styles.css`.

## Beta channel

Pushes to `beta` with a new `x.y.z-beta.N` version publish a GitHub **pre-release** automatically through `plugin-beta-release.yml`, with the same three assets and `changelog/Unreleased.md` as notes. BRAT reads the manifest from the release assets and installs the highest version including pre-releases, so no `manifest-beta.json` is needed; see [BRAT's developer guide](https://tfthacker.com/brat-developers) and [beta-testing.md](beta-testing.md) for the tester side.

Pre-releases are never marked *latest* and `versions.json` never lists beta versions, so the community directory and stable installs cannot pick them up. Obsidian will not move a tester from `0.2.0-beta.N` to the `0.2.0` stable release by itself; BRAT does.

## Community directory

Submission and updates go through <https://community.obsidian.md> (not a pull request to `obsidian-releases`).

- First submission: sign in, link GitHub, add the repository. An automated review of the manifest, release assets, source code and a build verification runs within minutes. Only errors block the listing; warnings are shown on the scorecard.
- Updates: publishing a new GitHub release is enough. Every release is scanned again.
- Use **Review branch** in the developer dashboard to scan a branch, tag or commit before releasing.
- The build verification runs `npm run build` in a clean container. `postbuild` only copies into vaults that already exist, so it is a no-op there.
- `npm run lint` runs `eslint-plugin-obsidianmd`, the same rule set the scanner uses.

Screenshots (1200×800), icon, descriptions and categories are edited in the dashboard under **Edit listing**, not in the repository.

## Validation and known review findings

CI gates changes on TypeScript, the test suite, the production build, local preflight checks and release asset validation. The release workflow repeats these checks before preparing assets. One WebGL integration test is intentionally skipped in the jsdom suite.

Lint is a blocking CI check with zero tolerance, so a green CI run means lint is clean. The one accepted finding, a `Function` constructor used for Fantasy Statblocks layout callbacks (see [PRIVACY.md](../PRIVACY.md)), is recorded in `eslint.suppressions.json`; Obsidian's scanner still lists it (see [development.md](development.md#lint)). Local preflight also reports bundle/CSS warnings for the Function constructor, HTML rendering, clipboard access, `!important` and `:has()`, and fails when the built `styles.css` lacks the licence notice for its fonts, or a credit, source or licence link in it, or declares a different number of fonts than `scripts/font-notices.js` lists, or when `main.js` inlines a font.

Local preflight is only an approximation. The authoritative result is the portal's **Review branch** scan, as described in [Obsidian's entry management documentation](https://docs.obsidian.md/community-directory/manage-entry). Resolve any portal errors before publishing the directory listing.
