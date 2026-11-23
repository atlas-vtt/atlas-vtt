# Translations

- UI text goes through `t(key, values)` (`src/app/i18n/`). English (`locales/en/`) is the source and holds every key; another language is a folder `locales/<code>/` with the same files (typed `Translation`), registered in `TRANSLATIONS` under Obsidian's language code. A missing key falls back to English, and a test checks that translations keep the English placeholders.
- A key's first segment names its file: `palette.moveTool` lives in `locales/<lang>/palette.ts`, spread into that language's `index.ts`. The segment must be a valid identifier and no reserved word (`exportDialog`, not `export`).
- `{name}` placeholders take values; a message with plural forms (`{ one, few, many, other }`, categories of `Intl.PluralRules`) is picked by `count`. Never build a sentence by concatenating translated pieces; join lists with `formatList`.
- The language is Obsidian's (`getLanguage()`), read when the module loads, so texts built at module level are translated too; Obsidian restarts on a language change, so nothing re-renders. `Intl` formatters that should match the texts use `getLocale()`.
- Keys, ids and stored data are never translated: only what is shown. Game system presets, the GitHub issue report and log messages stay English.
