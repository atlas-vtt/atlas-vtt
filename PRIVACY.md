# Privacy and network use

Atlas VTT works offline. Maps, tokens, notes, audio and settings stay in your vault. Submitting an issue report is an optional network action.

- No accounts, no telemetry, no analytics, no ads.
- No code is downloaded or executed from the internet, and the plugin does not update itself.

## Network access

If you set a token or map background to an `http://` or `https://` image URL, or copy an image that a note embeds from an external URL, that image is downloaded from the address in question. Images stored in your vault cause no network traffic.

Another Obsidian plugin can add a dice look through Atlas's extension API. When the look's face art or preview is an `https:` link, Atlas loads that image from the web, when the look is shown or thrown. Without such a plugin no image is loaded this way.

## Files outside the vault

Atlas VTT does not read or write files outside your vault.

## Code execution

When the optional [Fantasy Statblocks](https://github.com/javalent/fantasy-statblocks) plugin is installed, Atlas VTT renders creature statblocks with that plugin's layouts. Layouts can contain small JavaScript callbacks (for example to format a modifier). Atlas VTT runs those callbacks exactly as Fantasy Statblocks does. They come only from Fantasy Statblocks' own layout data on your computer — never from note content or the internet. That includes layouts you imported from someone else, so only import layouts you trust, as you would for Fantasy Statblocks itself. Without Fantasy Statblocks installed, no such code runs.

Atlas VTT converts imported images in background workers so Obsidian stays responsive. The workers run code bundled in the plugin's `main.js`, started from a local blob URL; nothing is downloaded, and they only receive the images you import.

## Issue reports

The **Report an issue** command and **Settings → Atlas VTT → Help and feedback**
open a form inside Obsidian. **Submit report** sends the filled report over HTTPS
to the Atlas reporting service. The service
publishes it as a public GitHub issue and returns a confirmation. No GitHub
account is required. Nothing is sent merely by opening the form.

The report includes the text you enter and the Atlas, Obsidian and Electron
versions, operating system, interface language and active theme. Community
plugin names/versions and recent Atlas errors are optional. Automated diagnostics
exclude vault names, file paths, note contents and map data; your own report
text is published as entered.

The reporting service processes your IP address for abuse prevention. It stores
a daily keyed address hash for up to 24 hours, not the raw IP. It retains request
identifiers, report hashes and issue receipts to prevent duplicate submissions;
it does not retain report bodies separately from GitHub. **Copy report** writes
the report to your clipboard without sending it. See
[docs/reporting-issues.md](docs/reporting-issues.md).

## Clipboard and local storage

The clipboard is written only when you choose a copy action (for example "Copy image"). Interface state such as the music queue is kept in local storage on your device.
