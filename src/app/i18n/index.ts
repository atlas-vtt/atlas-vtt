import { en } from './locales/en';
import { ru } from './locales/ru';
import type { Message, MessageKey, MessageValues, Translation } from './types';

export type { MessageKey } from './types';

/** Languages Atlas speaks, keyed by Obsidian's language codes (`getLanguage()`: `ru`, `pt-BR`, `zh-TW`, …). */
export const TRANSLATIONS: Readonly<Record<string, Translation>> = { en, ru };

const DEFAULT_LOCALE = 'en';
const DEFAULT_PLURAL_RULES = new Intl.PluralRules(DEFAULT_LOCALE);

let locale = DEFAULT_LOCALE;
let translation: Translation = en;
let pluralRules = DEFAULT_PLURAL_RULES;

/** Picks the supported language for `language`: the exact code, else its base language (`pt` for `pt-BR`), else English. */
export function resolveLocale(language: string): string {
  const code = Object.keys(TRANSLATIONS).find((key) => key.toLowerCase() === language.toLowerCase());
  if (code) return code;
  const base = language.split('-')[0]?.toLowerCase() ?? '';
  return base in TRANSLATIONS ? base : DEFAULT_LOCALE;
}

/** Sets the language of every later `t` call. The plugin selects it during bootstrap. */
export function setLocale(language: string): void {
  locale = resolveLocale(language);
  translation = TRANSLATIONS[locale] ?? en;
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

/** Joins `items` as the active language does: "a, b and c". */
export function formatList(items: readonly string[]): string {
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(items);
}
