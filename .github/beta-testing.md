# Beta testing Atlas VTT

Beta builds are GitHub pre-releases cut from the `beta` branch. They never
appear in Obsidian's community directory or in its update checks, so installing
one is a deliberate choice. Use a separate test vault: beta builds may migrate
Atlas data in ways an older stable release cannot read.

## Install a beta build

1. Install the community plugin **BRAT** (Beta Reviewer's Auto-update Tool) and
   enable it.
2. Open **Settings → BRAT → Add beta plugin**.
3. Enter `ByteMirror/atlas-vtt`. Leave the version on *latest* to follow the
   newest build, or pick a specific `x.y.z-beta.N` to freeze on it.
4. Enable **Atlas VTT** under **Settings → Community plugins**.

BRAT reads `manifest.json` from the release assets and picks the highest
version, including pre-releases, so a `0.2.0-beta.3` build updates a
`0.2.0-beta.2` install. When BRAT's *Auto-update at startup* is on, new beta
builds arrive automatically; otherwise run **BRAT: Check for updates** from the
command palette.

## Report what you find

Open an issue with the beta version (shown in **Settings → Community plugins**
and in the release title), the steps to reproduce, and what you expected. The
release notes on each pre-release list what changed and is worth testing.

## Return to the stable channel

Remove Atlas VTT from BRAT's beta list, uninstall the plugin, and reinstall it
from the community directory. Obsidian does not update a `0.2.0-beta.N` install
to the `0.2.0` stable release on its own; BRAT does, but only while the plugin
stays in its beta list.
