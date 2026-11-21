import { en } from './locales/en';
import type { Message, MessageKey, MessageValues, Translation } from './types';

export type { MessageKey } from './types';

/** Translations keyed by Obsidian's language codes (`getLanguage()`: `ru`, `pt-BR`, `zh-TW`, …). */
export type Translations = Readonly<Record<string, Translation>>;

const DEFAULT_LOCALE = 'en';
const DEFAULT_PLURAL_RULES = new Intl.PluralRules(DEFAULT_LOCALE);

let locale = DEFAULT_LOCALE;
let translation: Translation = en;
let pluralRules = DEFAULT_PLURAL_RULES;

/** Picks the language of `translations` for `language`: the exact code, else its base language (`pt` for `pt-BR`), else English. */
export function resolveLocale(language: string, translations: Translations): string {
  const code = Object.keys(translations).find((key) => key.toLowerCase() === language.toLowerCase());
  if (code) return code;
  const base = language.split('-')[0]?.toLowerCase() ?? '';
  return base in translations ? base : DEFAULT_LOCALE;
}

/**
 * Sets the language of every later `t` call. The plugin selects it during bootstrap from `TRANSLATIONS`
 * (`./languages`), which only it imports: everything else renders English without loading other languages.
 */
export function setLocale(language: string, translations: Translations): void {
  locale = resolveLocale(language, translations);
  translation = translations[locale] ?? en;
  pluralRules = new Intl.PluralRules(locale);
}

/** The active language code, for `Intl` formatters that should match Atlas' texts. */
export function getLocale(): string {
  return locale;
}

/**
 * Renders `message` in the language of `rules`: a `count` value picks the plural form,
 * and `{name}` placeholders take `values.name` (numbers formatted for that language).
 */
export function formatMessage(message: Message, rules: Intl.PluralRules, values?: MessageValues): string {
  const count = values?.count;
  let text: string;
  if (typeof message === 'string') text = message;
  else text = (typeof count === 'number' ? message[rules.select(count)] : undefined) ?? message.other;
  if (!values) return text;
  const numberLocale = rules.resolvedOptions().locale;
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = values[name];
    if (value === undefined) return placeholder;
    return typeof value === 'number' ? value.toLocaleString(numberLocale) : value;
  });
}

/** The text for `key` in the active language, falling back to English; see `formatMessage` for `values`. */
export function t(key: MessageKey, values?: MessageValues): string {
  const own = translation[key];
  if (own === undefined) return formatMessage(en[key], DEFAULT_PLURAL_RULES, values);
  return formatMessage(own, pluralRules, values);
}

/**
 * The keys whose text names what a mouse or a keyboard does ("Right-click a token to add it") and that
 * have a second text for a finger under `<key>.touch` ("Touch and hold a token to add it").
 */
export type PointerKey = { [Key in MessageKey]: `${Key}.touch` extends MessageKey ? Key : never }[MessageKey];

let fingerInUse: () => boolean = () => false;

/** Tells the texts how to learn whether the pointer is a finger now. The plugin sets it during bootstrap; without it every text is the mouse's. */
export function setPointerSource(isFinger: () => boolean): void {
  fingerInUse = isFinger;
}

/**
 * The text for `key` as the pointer in use needs it: its `.touch` text while that is a finger, else
 * the text itself. Each of the two is a whole sentence of its own, never one built from the other.
 * A language that lacks the `.touch` text shows the English one, as for any missing key.
 */
export function tPointer(key: PointerKey, values?: MessageValues): string {
  return t(fingerInUse() ? `${key}.touch` : key, values);
}

/**
 * The keys whose text names what only the desktop app has (the player window, a second screen) and
 * that have a second text for Obsidian mobile under `<key>.mobile` (Table mode, an online table).
 */
export type PlatformKey = { [Key in MessageKey]: `${Key}.mobile` extends MessageKey ? Key : never }[MessageKey];

let onMobile: () => boolean = () => false;

/** Tells the texts how to learn whether Atlas runs in Obsidian mobile. The plugin sets it during bootstrap; without it every text is the desktop's. */
export function setPlatformSource(isMobile: () => boolean): void {
  onMobile = isMobile;
}

/**
 * The text for `key` as the app it runs in needs it: its `.mobile` text in Obsidian mobile, else
 * the text itself. Each is a whole sentence of its own, and a language that lacks the `.mobile`
 * text shows the English one, as `tPointer` does.
 */
export function tPlatform(key: PlatformKey, values?: MessageValues): string {
  return t(onMobile() ? `${key}.mobile` : key, values);
}

/** Joins `items` as the active language does: "a, b and c". */
export function formatList(items: readonly string[]): string {
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(items);
}
