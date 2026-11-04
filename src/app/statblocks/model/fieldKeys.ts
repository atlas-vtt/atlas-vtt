import { foldToAscii } from './asciiFold';
import { isCodeKey } from './fsCodeKeys';
import { isReservedKey } from './reservedKeys';
import type { FieldKey, TemplateField } from './templateTypes';
import { t } from '../../i18n';

/**
 * Labels whose conventional key is not their snake case, following FS's Basic
 * 5e layout. Keyed by the label's snake case, so "Hit Points", "hit points"
 * and "HIT POINTS" all find `hp`.
 */
const CONVENTIONAL_KEYS: ReadonlyMap<string, FieldKey> = new Map([
  ['hit_points', 'hp'],
  ['armor_class', 'ac'], ['armor', 'ac'], ['armour_class', 'ac'], ['armour', 'ac'],
  ['challenge', 'cr'], ['challenge_rating', 'cr'],
  ['saving_throws', 'saves'], ['saving_throw', 'saves'],
  ['skills', 'skillsaves'],
  ['abilities', 'stats'], ['ability_scores', 'stats'],
  ['portrait', 'image'], ['token', 'image'],
]);

/** How the auto template labels the conventional keys whose prettified form would read badly ("Hp"). */
const CONVENTIONAL_LABELS: ReadonlyMap<FieldKey, string> = new Map([
  ['hp', 'Hit points'], ['ac', 'Armor class'], ['cr', 'Challenge rating'], ['saves', 'Saving throws'],
  ['skillsaves', 'Skills'], ['stats', 'Abilities'],
]);

const MAX_KEY_LENGTH = 40;
const FALLBACK_KEY = 'field';
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** "Armor Class (AC)" → "armor_class_ac": ASCII-folded, lower case, runs of anything else as one `_`. */
function snakeCase(label: string): string {
  const snake = foldToAscii(label)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const prefixed = /^[0-9]/.test(snake) ? `${FALLBACK_KEY}_${snake}` : snake;
  return prefixed.slice(0, MAX_KEY_LENGTH).replace(/_+$/, '');
}

function lowerCaseSet(keys: Iterable<FieldKey>): Set<string> {
  return new Set(Array.from(keys, (key) => key.toLowerCase()));
}

/** A key no field may take: reserved by Atlas, Obsidian or FS, or read by FS as code. */
function isForbiddenKey(key: FieldKey): boolean {
  return isReservedKey(key) || isReservedKey(key.toLowerCase()) || isCodeKey(key);
}

/**
 * The key a new field with this label gets: the conventional key where there
 * is one ("Armor Class" → `ac`), else the label's snake case; `field` when
 * nothing of the label is left. A key that is taken (case-insensitively) or
 * forbidden gets `_2`, `_3`, … appended.
 */
export function labelToKey(label: string, existingKeys: Iterable<FieldKey>): FieldKey {
  const snake = snakeCase(label);
  const base = CONVENTIONAL_KEYS.get(snake) ?? (snake || FALLBACK_KEY);
  const taken = lowerCaseSet(existingKeys);
  const free = (key: FieldKey): boolean => !taken.has(key) && !isForbiddenKey(key);
  if (free(base)) return base;
  for (let suffix = 2; ; suffix++) {
    const key = `${base}_${suffix}`;
    if (free(key)) return key;
  }
}

/**
 * What is wrong with a key the user typed, in plain words, or null.
 * `existingKeys` are the other fields' keys (and former keys).
 */
export function keyProblem(key: string, existingKeys: Iterable<FieldKey>): string | null {
  if (key.trim() === '') return t('statblockEditor.key.empty');
  if (!KEY_PATTERN.test(key)) return t('statblockEditor.key.pattern');
  if (key.toLowerCase() === 'tags') return t('statblockEditor.key.tags');
  if (isReservedKey(key) || isReservedKey(key.toLowerCase())) {
    return t('statblockEditor.key.reserved', { key });
  }
  if (isCodeKey(key)) return t('statblockEditor.key.code', { key });
  if (lowerCaseSet(existingKeys).has(key.toLowerCase())) return t('statblockEditor.key.taken', { key });
  return null;
}

/** "hit_dice" → "Hit dice", "damageResistances" → "Damage resistances", `hp` → "Hit points". */
export function labelFromKey(key: FieldKey): string {
  const conventional = CONVENTIONAL_LABELS.get(key);
  if (conventional) return conventional;
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.\s]+/g, ' ')
    .trim()
    .toLowerCase();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Every key the fields hold now or held before a rename; a new field takes none of them. */
export function fieldKeysOf(fields: readonly TemplateField[]): Set<FieldKey> {
  const keys = new Set<FieldKey>();
  for (const field of fields) {
    keys.add(field.key);
    for (const former of field.formerKeys ?? []) keys.add(former);
  }
  return keys;
}

/** The field with this key, else the first that had it as a former key. */
export function fieldByKey(fields: readonly TemplateField[], key: FieldKey): TemplateField | undefined {
  return fields.find((field) => field.key === key)
    ?? fields.find((field) => field.formerKeys?.includes(key) === true);
}
