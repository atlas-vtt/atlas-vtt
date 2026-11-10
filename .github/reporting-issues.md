# Reporting issues

Inside Obsidian, run **Report an issue** from the command palette or open
**Settings → Atlas VTT → Help and feedback**. Choose the kind of issue and
affected area, add a title and description, and press **Submit report**.

Atlas submits the report directly and shows the created issue number.
You do not need a GitHub account or a second submission in your browser.
**View issue** is optional. **Copy report** saves a Markdown copy.

Reports are public on GitHub. Atlas includes its own version, the Obsidian and
Electron versions, operating system, interface language and theme. You can
exclude community plugin names/versions and recent Atlas errors using the
form's toggles. Environment details are visible before submission. Automated
diagnostics exclude vault names, file paths, note contents and map data.
Anything you type in the report is included, so review your text before sending.

If sending fails, the modal keeps your draft and shows an error. Retry from
the same modal or use **Copy report** to save your text. Do not close the modal
until you have saved an unsent draft. A report awaiting confirmation may have
reached GitHub; retrying it from the same modal will not create a second issue.

## From the player page

Players at an online table can open **More → Report an issue** on the player
page. The form sends the report to the same service, with the page's version,
browser, operating system and language, and optionally recent page errors. It
needs no GitHub account and no Atlas account.

## Maintainers

The reporting service source is in
[services/issue-reporter](../services/issue-reporter/README.md).
The endpoint must be deployed and configured in the plugin build before release.

The service and plugin share `src/app/support/issueCategories.json`. The
service sets `needs-triage`, `type:*` and `area:*` labels explicitly. Native
GitHub issue forms remain available for people filing reports on GitHub.
Their options are checked against the same categories by
`tests/unit/issueTemplates.test.ts`.
