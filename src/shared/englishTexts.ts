/**
 * Atlas's `t()` for the `@atlas-vtt/shared` packages, which run outside Obsidian and cannot read its language. Atlas's
 * own modules there call `t()` like everywhere else; the package build (`vite.shared.config.mts`) and the boundary test
 * resolve their `i18n` import to this module instead, so they keep Atlas's English texts. Only the texts of the modules
 * the packages carry are here (tests/api/sharedBoundary.test.ts checks every key they use).
 */
import { dice } from '../app/i18n/locales/en/dice';
import { laser } from '../app/i18n/locales/en/laser';
import { mapIcon } from '../app/i18n/locales/en/mapIcon';
import { token } from '../app/i18n/locales/en/token';

/** The English texts the shared modules use, by key. */
export const SHARED_ENGLISH: Readonly<Record<string, string | { readonly other: string }>> = { ...dice, ...laser, ...mapIcon, ...token };

/** The English text of `key`, its `{name}` marks filled from `values`; an unknown key reads as itself. */
export function t(key: string, values?: Readonly<Record<string, string | number>>): string {
  const message = SHARED_ENGLISH[key];
  const text = message === undefined ? key : typeof message === 'string' ? message : message.other;
  return values ? text.replace(/\{(\w+)\}/g, (mark, name: string) => (name in values ? String(values[name]) : mark)) : text;
}
