/**
 * Believable sample values by what a field is for (§6.2): the template
 * editor and the gallery preview a template with them while no statblock is
 * picked, so a preview reads like a statblock and never like a list of
 * property names. Generic, never a creature's or a rulebook's own text.
 * Pure: a field's key, label and meaning in, a value or nothing out.
 */

import type { FieldValue, TemplateField } from './templateTypes';

type Hint = readonly [RegExp, FieldValue];

const words = (field: TemplateField): string => `${field.key} ${field.label}`.toLowerCase().replace(/_/g, ' ');

/** One-line text values, by the first pattern their key or label matches. */
const TEXT_HINTS: readonly Hint[] = [
  [/\bspeed|movement|\bmove\b/, '30 ft.'],
  [/sense/, 'Darkvision 60 ft., passive Perception 12'],
  [/language/, 'Common'],
  [/condition/, 'Frightened'],
  [/vulnerab/, 'Fire'],
  [/resist/, 'Cold'],
  [/immun/, 'Poison'],
  [/subtype|ancestry/, ''],
  [/\btype\b|kind|category/, 'humanoid'],
  [/alignment/, 'neutral'],
  [/\bsize\b/, 'Medium'],
  [/gear|equipment|treasure|loot/, 'Shortsword, shield'],
  [/environment|habitat|terrain/, 'Forest, hills'],
  [/tier/, '1'],
  [/level/, '3'],
  [/motive|goal|want/, 'Guard the old road'],
  [/tactic/, 'Strikes from cover, then falls back'],
  [/morale/, '8'],
  [/attack/, 'Claw (1d6)'],
  [/damage/, '1d8 + 2'],
  [/difficulty|\bdc\b/, '12'],
  [/threshold/, '7 / 14'],
  [/source|book/, 'Homebrew'],
];

/** Numbers by what they count; a field Atlas reads as hit points or armour gets a fitting size. */
function sampleNumber(field: TemplateField): number {
  switch (field.meaning) {
    case 'hit-points': return 22;
    case 'armor': return 13;
    case 'initiative': return 2;
    default: break;
  }
  const said = words(field);
  if (/\bhp\b|hit points|health|wounds/.test(said)) return 22;
  if (/\bac\b|armou?r|defen[cs]e/.test(said)) return 13;
  if (/initiative|bonus|modifier|\bprof/.test(said)) return 2;
  if (/xp|experience/.test(said)) return 200;
  if (/level|tier|rank/.test(said)) return 3;
  return 10;
}

/** Names and texts of abilities, by the list they stand in. */
const ENTRY_HINTS: ReadonlyArray<readonly [RegExp, ReadonlyArray<readonly [string, string]>]> = [
  [/legendary/, [['Move', 'The creature moves up to half its speed.'], ['Strike', 'The creature makes one attack.']]],
  [/reaction/, [['Parry', 'The creature adds 2 to its armour against one melee attack that would hit it.']]],
  [/bonus/, [['Quick Step', 'The creature moves up to half its speed without provoking attacks.']]],
  [/lair|villain/, [['Rumbling Ground', 'The ground shakes; each creature nearby must keep its footing or fall.']]],
  [/action|attack|move/, [
    ['Multiattack', 'The creature makes two attacks.'],
    ['Strike', 'Melee attack: +4 to hit, reach 5 ft. Hit: 7 (1d8 + 3) damage.'],
  ]],
  [/reward|loot|item/, [['Coin Purse', 'A small pouch of coins.']]],
  [/feature|trait|abilit|power/, [
    ['Keen Senses', 'The creature notices what moves nearby, even in dim light.'],
    ['Pack Tactics', 'The creature fights best beside its allies.'],
  ]],
];
const FALLBACK_ENTRIES: ReadonlyArray<readonly [string, string]> = [
  ['First feature', 'What the feature does, in a sentence.'],
  ['Second feature', 'What the feature does, in a sentence.'],
];

/** The abilities a list previews with: names and texts by what the list holds. */
export function sampleEntryTexts(field: TemplateField): ReadonlyArray<readonly [string, string]> {
  const said = words(field);
  return ENTRY_HINTS.find(([pattern]) => pattern.test(said))?.[1] ?? FALLBACK_ENTRIES;
}

/** Pairs (saving throws, skills) by what they hold, keyed as notes key them. */
function samplePairsByWords(field: TemplateField): Record<string, FieldValue> | null {
  const said = words(field);
  if (/save|saving/.test(said)) return { dexterity: 2, wisdom: 3 };
  if (/skill/.test(said)) return { perception: 3, stealth: 4 };
  return null;
}

/** A pairs sample: one per slot where the field names slots, else by what it holds, else two examples. */
export function samplePairs(field: TemplateField): Record<string, FieldValue> {
  const slots = field.slotKeys ?? field.slots?.map((slot) => slot.toLowerCase());
  if (slots?.length) return Object.fromEntries(slots.map((key) => [key, 1]));
  return samplePairsByWords(field) ?? { first: 3, second: 4 };
}

/** A one-line text sample; null where nothing fits, so the caller shows a neutral dash. */
export function sampleText(field: TemplateField): FieldValue {
  const said = words(field);
  const hint = TEXT_HINTS.find(([pattern]) => pattern.test(said));
  return hint ? hint[1] : '—';
}

export { sampleNumber };
