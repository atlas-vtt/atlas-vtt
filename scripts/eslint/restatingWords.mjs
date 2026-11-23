/**
 * The words of `atlas/restating-comments`: whether a comment says only what the name it stands on
 * says already. Pure text, so the unit test reads it without a parser.
 *
 * Every choice here errs towards leaving a comment alone: a word the name lacks keeps it.
 */

/**
 * Words that carry nothing by themselves: articles, `of` and `for`, and the nouns and verbs that
 * only name what sort of declaration follows. Left out, since beside a name they say which one is
 * meant or how: words of the game (map, item, field, list, kind, handle), pronouns, `new`, and the
 * prepositions of direction and measure (`to`, `from`, `in`: "clips to the floors", "in cells").
 */
export const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'for', 'and', 'or',
  'is', 'are', 'be', 'whether', 'if', 'current', 'given',
  'value', 'values', 'data', 'info', 'object', 'array', 'state',
  'function', 'method', 'handler', 'callback', 'helper', 'component', 'hook', 'props', 'property',
  'variable', 'constant', 'class', 'interface', 'instance',
  'get', 'gets', 'return', 'returns', 'check', 'checks',
]);

/** Short and long spellings of one word; a name says `id` where its comment says `identifier`. */
const ALIASES = new Map(Object.entries({
  identifier: 'id', number: 'num', configuration: 'config', property: 'prop', reference: 'ref', function: 'fn',
  callback: 'cb', element: 'el', position: 'pos', index: 'idx', maximum: 'max', minimum: 'min',
}));

/** A single word is a label: of a group, or of what a field belongs to. */
const MIN_WORDS = 2;
const MAX_WORDS = 8;
/** One plain sentence: letters, spaces, commas, hyphens and apostrophes, with at most a full stop at its end. */
const PLAIN_SENTENCE = /^[A-Za-z][A-Za-z ,'’-]*\.?$/;
const SUFFIXES = ['ing', 'ed'];
/** The shortest stem a suffix is cut down to: `noted` is `note`, never `not`. */
const MIN_STEM = 4;

/**
 * The words a name is made of: `tokenId`, `TokenId`, `token_id` and `TOKEN_ID` are all `token`, `id`.
 * @param {string} name
 * @returns {string[]} In lower case; a run of digits is a word.
 */
export function wordsOfName(name) {
  return (name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g) ?? []).map((word) => word.toLowerCase());
}

/** @param {string} word */
const undoubled = (word) => word.replace(/([b-df-hj-np-tv-z])\1$/, '$1');

/**
 * The forms a word may stand for: itself, its singular, its verb without `ing` or `ed`, each in
 * its short spelling. Two words are the same word when their forms meet.
 * @param {string} word
 * @returns {string[]}
 */
export function formsOf(word) {
  const lower = word.toLowerCase();
  const forms = new Set([lower]);
  if (/ies$/.test(lower)) forms.add(`${lower.slice(0, -3)}y`);
  else if (/(ss|x|ch|sh|z)es$/.test(lower)) forms.add(lower.slice(0, -2)).add(lower.slice(0, -1));
  else if (/[^su]s$/.test(lower) && lower.length > 2) forms.add(lower.slice(0, -1));
  for (const suffix of SUFFIXES) {
    if (!lower.endsWith(suffix)) continue;
    const stem = lower.slice(0, -suffix.length);
    if (stem.length >= MIN_STEM) forms.add(stem).add(undoubled(stem));
    if (stem.length >= MIN_STEM - 1) forms.add(`${stem}e`);
  }
  return [...new Set([...forms].map((form) => ALIASES.get(form) ?? form))];
}

/**
 * The words of a comment that is one plain sentence of a few words.
 * @param {string} text The comment without its markers.
 * @returns {string[] | null} Null for anything else: a tag, code, a number, a link, a second sentence, a single word.
 */
export function sentenceWords(text) {
  const sentence = text.replace(/\s+/g, ' ').trim();
  if (!PLAIN_SENTENCE.test(sentence)) return null;
  const words = sentence.replace(/\.$/, '').split(/[ ,-]+/).filter(Boolean).map((word) => word.toLowerCase().replace(/['’]s$/, ''));
  return words.length >= MIN_WORDS && words.length <= MAX_WORDS ? words : null;
}

/**
 * Whether a comment only repeats the name it stands on: every word of it is a word of the name or
 * carries nothing, and at least one is the name's.
 * @param {string} text The comment without its markers.
 * @param {string} name The declared name.
 * @returns {boolean}
 */
export function isRestating(text, name) {
  const words = sentenceWords(text);
  if (!words) return false;
  const named = new Set(wordsOfName(name).flatMap(formsOf));
  let fromName = 0;
  for (const word of words) {
    if (formsOf(word).some((form) => named.has(form))) fromName++;
    else if (!STOP_WORDS.has(word)) return false;
  }
  return fromName > 0;
}
