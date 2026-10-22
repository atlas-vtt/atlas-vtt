# Privacy and network use

Atlas VTT works offline. Maps, tokens, notes, audio and settings stay in your vault. Atlas connects to the internet only to look for a newer version of itself (which you can switch off) and when you choose to: to host online play, to submit an issue report, or to load an image from a web address.

- No telemetry, no analytics, no ads.
- You need no account to use Atlas. Only hosting online play needs an Atlas account.
- No code is downloaded or executed from the internet, and the plugin does not update itself.

## Network access

**Update check.** Once when Obsidian starts and then every hour, Atlas reads `manifest.json` from `https://raw.githubusercontent.com/atlas-vtt/atlas-vtt/HEAD/manifest.json`, the file Obsidian itself installs Atlas from, and compares its version number with yours. The request carries nothing about you or your vault; GitHub sees your IP address, as with any web request. Atlas never downloads or installs the update: **Update** opens the plugin's page in Obsidian, where Obsidian installs it. Switch the check off in **Settings → Atlas VTT → Updates → Check for updates**; while it is off, Atlas makes no such request unless you press **Check now**.

If you set a token or map background to an `http://` or `https://` image URL, or copy an image that a note embeds from an external URL, that image is downloaded from the address in question. Images stored in your vault cause no network traffic.

## Online play (closed beta)

Online play lets you host a table that your players join from their web browsers. It is off until you turn on **Online play** in the command palette's **Experimental features** page. While it is off, Atlas makes no connection for it.

**Your account.** To host a table you sign in with an Atlas account at `https://api.atlas-vtt.dev`. Atlas opens `https://atlas-vtt.dev` in your browser, where you approve the sign-in. The sign-in token is kept in Obsidian's secret storage on this device (Obsidian 1.11.4 or newer), never in the plugin's data or in a synced file. **Sign out** ends the session on the server too. While online play is in closed beta, hosting also needs an invite key, which you redeem on the [account page](https://atlas-vtt.dev/account). There you can also export or delete your account. What the account service keeps, and for how long, is in the [Atlas privacy notice](https://atlas-vtt.dev/legal/privacy).

**Running a table.** Nothing is sent until you start a table. While it runs, Atlas connects to the table server at `https://play.atlas-vtt.dev` over an encrypted WebSocket and sends what your players may see: the scene you share as they see it (map, tokens, fog and lighting), images you show them, and what happens at the table, such as dice rolls, chat, loot you hand out, and their characters' sheets, quests and world map. Maps and art go from your computer through the server to each player's browser. The server passes all of this on and keeps none of it. For each table it keeps your account number, check values (hashes) of the table's secret, its join code and the players' keys, when the table was made, and a short tag that names no one. A table is deleted when you end it, when you start another, or 24 hours after you leave it. Players need no account: they join with your link, the join code and a name of their choice, which the server holds only while they are connected or waiting to be let in. The [Atlas privacy notice](https://atlas-vtt.dev/legal/privacy) describes the table server in full.

**On this device.** The running table, its log and your players' sheets are kept in `atlas-vtt/.atlas-data/online.json`, a folder sync tools do not carry.

**Error reports and feedback.** **Send error reports** (Settings → Atlas VTT, off by default) sends online play's own errors to `https://play.atlas-vtt.dev`, without the table's code, secret, join code or the players' names. They are kept for 30 days. Feedback you send from the online panel goes there too, with diagnostics only if you include them, and is kept for 180 days.

## Files outside the vault

Atlas VTT reads files outside your vault only when you choose them for import. Random-table imports read selected PDF, XLSX, CSV, TSV, Markdown and text files on your device and create Markdown notes inside your vault. The source files are not changed or uploaded. Atlas does not scan other files on your device.

PDF imports use Obsidian's bundled PDF reader. XLSX imports read XML parts locally; the Open XML namespace identifiers in those parts are format names, not network requests.

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

Players at an online table can report an issue from **More → Report an issue**
on the player page. **Submit report** sends the report from their browser over
HTTPS to the same reporting service, which publishes it the same way. Nothing is
sent merely by opening the form. The report includes the text the player enters,
the page's version, the browser and operating system by name only, and the
interface language; recent page errors are optional. Before it is sent, the
page takes the table's code, the join code and the player's key and name out of
the text. It never includes the table, its map, tokens, notes or chat.

The reporting service processes your IP address for abuse prevention. It stores
a daily keyed address hash for up to 24 hours, not the raw IP. It retains request
identifiers, report hashes and issue receipts to prevent duplicate submissions;
it does not retain report bodies separately from GitHub. **Copy report** writes
the report to your clipboard without sending it. See
[.github/reporting-issues.md](.github/reporting-issues.md).

## Clipboard and local storage

The clipboard is written only when you choose a copy action (for example "Copy image"). Interface state such as the music queue is kept in local storage on your device.
