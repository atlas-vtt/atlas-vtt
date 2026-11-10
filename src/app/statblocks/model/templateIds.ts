import { foldToAscii } from './asciiFold';
import { BUILT_IN_TEMPLATE_PREFIX, type TemplateId } from './templateTypes';

/** A number in [0, 1), as `Math.random` gives; injected so tests are deterministic. */
export type RandomSource = () => number;
/** Gives a block id that is free in the template it is made for. */
export type BlockIdSource = () => string;

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';
const TEMPLATE_SUFFIX_LENGTH = 6;
const BLOCK_ID_LENGTH = 8;
const MAX_SLUG_LENGTH = 40;
const FALLBACK_SLUG = 'template';

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const BUILT_IN_ID = new RegExp(`^${BUILT_IN_TEMPLATE_PREFIX}${SLUG}$`);
const VAULT_ID = new RegExp(`^${SLUG}-[a-z0-9]{${TEMPLATE_SUFFIX_LENGTH}}$`);

/**
 * "Marsh Créature!" → "marsh-creature", "Größe" → "grosse": lower-case ASCII letters and digits
 * joined by single hyphens, at most 40 characters. Empty when the name holds
 * no letter or digit that folds to ASCII.
 */
export function slugify(name: string): string {
  const words = foldToAscii(name)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
  let slug = '';
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > MAX_SLUG_LENGTH) return slug || word.slice(0, MAX_SLUG_LENGTH);
    slug = next;
  }
  return slug;
}

function randomDigit(random: RandomSource): string {
  const index = Math.min(BASE36.length - 1, Math.max(0, Math.floor(random() * BASE36.length)));
  return BASE36.charAt(index);
}

function randomBase36(length: number, random: RandomSource): string {
  let text = '';
  for (let i = 0; i < length; i++) text += randomDigit(random);
  return text;
}

/** The next base36 string of the same length, wrapping from "zz…z" to "00…0". */
function successor(id: string): string {
  const digits = id.split('');
  for (let i = digits.length - 1; i >= 0; i--) {
    const value = BASE36.indexOf(digits[i] ?? '0');
    if (value < BASE36.length - 1) {
      digits[i] = BASE36.charAt(value + 1);
      return digits.join('');
    }
    digits[i] = '0';
  }
  return digits.join('');
}

/** `<slug>-<6 base36>` for a vault template: "marsh-creature-k7m2qa". */
export function newTemplateId(name: string, random: RandomSource = Math.random): TemplateId {
  return `${slugify(name) || FALLBACK_SLUG}-${randomBase36(TEMPLATE_SUFFIX_LENGTH, random)}`;
}

/**
 * Eight base36 characters no block in `existing` has. A taken draw steps to
 * the next free id, so a poor random source can slow it but never loop.
 */
export function newBlockId(existing: ReadonlySet<string>, random: RandomSource = Math.random): string {
  const first = randomBase36(BLOCK_ID_LENGTH, random);
  let id = first;
  while (existing.has(id)) {
    id = successor(id);
    if (id === first) throw new Error('Every block id is taken.');
  }
  return id;
}

/** Block ids free in `existing` and in every id it gave before. */
export function blockIdSource(existing: Iterable<string>, random: RandomSource = Math.random): BlockIdSource {
  const taken = new Set(existing);
  return () => {
    const id = newBlockId(taken, random);
    taken.add(id);
    return id;
  };
}

/** `builtin:<slug>`, or a vault template's `<slug>-<6 base36>`. */
export function isValidTemplateId(id: string): boolean {
  return BUILT_IN_ID.test(id) || VAULT_ID.test(id);
}
