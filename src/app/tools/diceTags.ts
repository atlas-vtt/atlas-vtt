/**
 * A die's tag: the colour it was thrown in and that colour's name (e.g. "Fire", `#dd3333`), as
 * an extension reports it or the dice tray picks it. Carried, saved with the dice log and shown; never
 * part of the roll's result. It lives on each die (`roll.color`, `roll.colorName`).
 */

import type { RolledDie } from './diceFormula';

/** The longest colour name a die keeps. */
export const MAX_DIE_TAG_NAME = 32;

const HEX = /^#[0-9a-f]{6}$/i;
/** Not plain text: markup and link brackets, code ticks, control and invisible formatting characters (bidi overrides among them). */
const NOT_PLAIN = /[<>[\]`\p{Cc}\p{Cf}]/u;

/** `value` as a die's colour: `#rrggbb`, else nothing. */
export function tagColour(value: unknown): string | undefined {
  return typeof value === 'string' && HEX.test(value) ? value : undefined;
}

/** `value` as a die's colour name: plain text (any script, emoji and punctuation; no markup), trimmed, 1 to 32 characters; else nothing. */
export function tagName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.trim();
  return name !== '' && [...name].length <= MAX_DIE_TAG_NAME && !NOT_PLAIN.test(name) ? name : undefined;
}

/** `die` with a colour or name it may keep, and without one it may not; the same object when nothing is dropped. */
function cleanDie<D extends RolledDie>(die: D): D {
  const color = tagColour(die.color);
  const colorName = tagName(die.colorName);
  if (color === die.color && colorName === die.colorName) return die;
  const { color: _color, colorName: _name, ...rest } = die;
  return { ...rest, ...(color !== undefined && { color }), ...(colorName !== undefined && { colorName }) } as D;
}

/** A roll whose dice keep only well-formed tags: a bad tag is dropped, never the roll. The same object when every tag is fine. */
export function withCleanTags<R extends { rolls: readonly RolledDie[] }>(result: R): R {
  const rolls = result.rolls.map(cleanDie);
  return rolls.every((die, i) => die === result.rolls[i]) ? result : { ...result, rolls };
}

/** A die's tag as shown: its colour, and its name or, without one, the colour itself, so colour is never the only sign. */
export interface ShownTag {
  key: string;
  color: string | null;
  label: string;
}

/** The tag a die shows, checked again (a map file can be edited by hand); null for an untagged die. */
export function shownTag(die: Pick<RolledDie, 'color' | 'colorName'>): ShownTag | null {
  const color = tagColour(die.color) ?? null;
  const name = tagName(die.colorName) ?? null;
  if (color === null && name === null) return null;
  return { key: `${color ?? ''}|${name ?? ''}`, color, label: name ?? color! };
}

/** A well-formed tag a die is rolled in: the shape of `RolledDie`'s `color` and `colorName`. */
export interface DieTag {
  color: string;
  colorName: string;
}

/** `value` as a tag a die can be rolled in: a `#rrggbb` colour and a plain-text name; else null. */
export function dieTag(value: unknown): DieTag | null {
  if (typeof value !== 'object' || value === null) return null;
  const color = tagColour(Reflect.get(value, 'color'));
  const colorName = tagName(Reflect.get(value, 'name'));
  return color !== undefined && colorName !== undefined ? { color, colorName } : null;
}

/**
 * `result` with `tags` on its dice: one per die of the formula, in formula order (null leaves that die untagged). A
 * die rolled for an explosion (`exploded`) is no die of the formula: it takes the tag of the die it exploded from.
 * Only well-formed tags are kept (`withCleanTags`).
 */
export function withDieTags<R extends { rolls: readonly RolledDie[] }>(result: R, tags: ReadonlyArray<DieTag | null>): R {
  let next = 0;
  let current: DieTag | null = null;
  const rolls = result.rolls.map((die) => {
    if (die.exploded !== true) current = tags[next++] ?? null;
    if (!current) return die;
    return { ...die, color: current.color, colorName: current.colorName };
  });
  return withCleanTags({ ...result, rolls });
}
