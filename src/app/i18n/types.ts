import type { en } from './locales/en';

/** A text whose wording depends on `count`, one form per plural category of the language (`Intl.PluralRules`). */
export type PluralMessage = { readonly other: string } & Partial<
  Record<Exclude<Intl.LDMLPluralRule, 'other'>, string>
>;

/** A UI text; `{name}` marks a value filled in by `t`. */
export type Message = string | PluralMessage;

export type MessageKey = keyof typeof en;

/** A language's texts; a key it lacks falls back to English. */
export type Translation = Partial<Record<MessageKey, Message>>;

export type MessageValues = Readonly<Record<string, string | number>>;
