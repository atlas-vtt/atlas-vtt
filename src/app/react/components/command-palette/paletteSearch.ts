import type { CommandOption } from './types';

/** How well one query word matches one word of an option, best first; 0 is no match. */
const EXACT = 10;
const PREFIX = 8;
const INFIX = 5;
const TYPO = 4;
/** A keyword says what an option holds, its label what it is: a label's word counts for more. */
const KEYWORD_WEIGHT = 0.6;
/** The whole query standing at the start of the label, or anywhere in it, as typed. */
const LEADS_LABEL = 6;
const IN_LABEL = 3;

/** Lower case, accents dropped, so "Héros" is found by "heros". */
const normalise = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const wordsOf = (text: string): string[] => normalise(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Edits between two words, a swap of neighbours counting as one (optimal string alignment). */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
}

/** Typos a query word may hold: none below five letters, where one edit makes another word ("grid", "grit"). */
const typosAllowed = (token: string): number => (token.length >= 9 ? 2 : token.length >= 5 ? 1 : 0);

function wordScore(token: string, word: string): number {
  if (word === token) return EXACT;
  if (word.startsWith(token)) return PREFIX;
  if (token.length >= 3 && word.includes(token)) return INFIX;
  const allowed = typosAllowed(token);
  if (allowed === 0) return 0;
  // A word being typed is matched against as much of the word as was typed
  const typed = word.length > token.length ? word.slice(0, token.length) : word;
  return Math.min(editDistance(token, word), editDistance(token, typed)) <= allowed ? TYPO : 0;
}

const bestScore = (token: string, words: readonly string[]): number =>
  words.reduce((best, word) => Math.max(best, wordScore(token, word)), 0);

/**
 * How well `query` finds an option: every word of the query must match a word of its label or
 * keywords, in any order, as the whole word, its start, a part of it or a word one typo away.
 * Null when one does not; an empty query finds everything with 0.
 */
export function searchScore(query: string, label: string, keywords: readonly string[] = []): number | null {
  const tokens = wordsOf(query);
  if (tokens.length === 0) return 0;
  const labelWords = wordsOf(label);
  const keywordWords = keywords.flatMap(wordsOf);
  let score = 0;
  for (const token of tokens) {
    const hit = Math.max(bestScore(token, labelWords), bestScore(token, keywordWords) * KEYWORD_WEIGHT);
    if (hit === 0) return null;
    score += hit;
  }
  const phrase = tokens.join(' ');
  const labelText = labelWords.join(' ');
  if (labelText.startsWith(phrase)) score += LEADS_LABEL;
  else if (labelText.includes(phrase)) score += IN_LABEL;
  return score;
}

/**
 * The options `query` finds, best first, and kept together by section so that the list reads in the
 * order the arrow keys walk it: sections in the order of their best option. Ties keep the given order.
 */
export function searchOptions(options: readonly CommandOption[], query: string): CommandOption[] {
  const found = options.flatMap((option, index) => {
    const score = searchScore(query, option.label, option.keywords);
    return score === null ? [] : [{ option, score, index }];
  });
  const sectionBest = new Map<string, number>();
  for (const { option, score } of found) sectionBest.set(option.section, Math.max(sectionBest.get(option.section) ?? 0, score));
  const sectionOrder = [...sectionBest.entries()].sort((a, b) => b[1] - a[1]).map(([section]) => section);
  return found
    .sort((a, b) => sectionOrder.indexOf(a.option.section) - sectionOrder.indexOf(b.option.section) || b.score - a.score || a.index - b.index)
    .map(({ option }) => option);
}
