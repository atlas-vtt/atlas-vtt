import type { FieldValue } from '../../../../src/app/statblocks/model/templateTypes';
import { int, pick } from './patchTestKit';

/**
 * Random statblock notes in the shapes vaults hold: flow and block lists, entries, nested maps,
 * block scalars, quoted and long plain scalars, comments, anchors, 0/2/4-space lists, CRLF,
 * a byte order mark, bodies with `---` lines. Each entry knows its value and what may target it.
 */

export type EntryKind = 'scalar' | 'flowSeq' | 'flowMap' | 'blockSeq' | 'entries' | 'map' | 'blockScalar' | 'frozen';

export interface NoteEntry {
  key: string;
  kind: EntryKind;
  lines: string[];
}

export interface RandomNote {
  text: string;
  entries: NoteEntry[];
  eol: '\n' | '\r\n';
  hasFrontmatter: boolean;
}

const KEYS = ['name', 'hp', 'ac', 'cr', 'size', 'type', 'speed', 'stats', 'actions', 'traits', 'senses', 'desc', 'tags',
  'level', 'atlas-template', 'statblock', 'x y', 'Größe', 'hit_dice', 'saves', 'skills', 'notes', 'image', 'alignment'];

const SCALARS: Array<[string, FieldValue]> = [
  ['Goblin', 'Goblin'], ['Small humanoid', 'Small humanoid'], ['Ünïcödé 🐉', 'Ünïcödé 🐉'], ['1/4', '1/4'], ['3+1*', '3+1*'],
  ['7d10 + 14', '7d10 + 14'], ['30 ft., climb 30 ft.', '30 ft., climb 30 ft.'], ['12', 12], ['-3', -3], ['2.5', 2.5],
  ['true', true], ['false', false], ['', null], ['~', null], ['"5"', '5'], ['"yes"', 'yes'], ['"a: b"', 'a: b'],
  ['"line\\nbreak"', 'line\nbreak'], ["'Medium'", 'Medium'], ["'it''s'", "it's"], ['"2024-01-01"', '2024-01-01'],
  ['[[Linked note]]', [['Linked note']]], ['"[[Linked note]]"', '[[Linked note]]'],
];

const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima'];

export function randomNote(random: () => number): RandomNote {
  const eol = random() < 0.3 ? '\r\n' : '\n';
  const seqIndent = pick(random, [0, 2, 2, 4]);
  const mapIndent = pick(random, [2, 2, 4]);
  const hasFrontmatter = random() > 0.05;
  const keys = shuffled(random, KEYS).slice(0, hasFrontmatter ? 2 + int(random, 9) : 0);
  const entries = keys.map((key, index) => randomEntry(random, key, index, { seqIndent, mapIndent }));
  if (entries.length > 2 && random() < 0.15) addAnchorPair(entries);

  const yamlLines: string[] = [];
  for (const entry of entries) {
    if (random() < 0.15) yamlLines.push(pick(random, ['# a comment', '', '#another: comment']));
    yamlLines.push(...entry.lines);
  }
  if (random() < 0.15) yamlLines.push('# trailing comment');
  const yaml = yamlLines.map((line) => line + eol).join('');
  const body = randomBody(random, eol);
  const bom = random() < 0.05 ? '﻿' : '';
  const text = hasFrontmatter ? `${bom}---${eol}${yaml}---${body.length > 0 || random() < 0.5 ? eol : ''}${body}` : bom + body;
  return { text, entries, eol, hasFrontmatter };
}

interface Indents { seqIndent: number; mapIndent: number }

function randomEntry(random: () => number, key: string, index: number, indents: Indents): NoteEntry {
  const keyText = key === 'x y' || random() > 0.1 ? key : `"${key}"`;
  const seqPad = ' '.repeat(indents.seqIndent);
  const mapPad = ' '.repeat(indents.mapIndent);
  const comment = random() < 0.2 ? ' # note' : '';
  const words = shuffled(random, WORDS).slice(0, 1 + int(random, 4)).map((word) => `${word}${index}`);
  switch (pick(random, ['scalar', 'scalar', 'flowSeq', 'flowMap', 'blockSeq', 'entries', 'entries', 'map', 'blockScalar', 'long'])) {
    case 'flowSeq': {
      const items = random() < 0.5 ? words : words.map((_, i) => 10 + i * 3 + index);
      const inner = items.join(', ');
      return { key, kind: 'flowSeq', lines: [`${keyText}: ${random() < 0.3 ? `[ ${inner} ]` : `[${inner}]`}${comment}`] };
    }
    case 'flowMap':
      return { key, kind: 'flowMap', lines: [`${keyText}: {walk: ${30 + index}, fly: ${60 + index}}${comment}`] };
    case 'blockSeq':
      return { key, kind: 'blockSeq', lines: [`${keyText}:`, ...words.map((word) => `${seqPad}- ${word}`)] };
    case 'entries':
      return { key, kind: 'entries', lines: [`${keyText}:`, ...words.flatMap((word, i) => entryLines(seqPad, word, i, random))] };
    case 'map':
      return { key, kind: 'map', lines: [`${keyText}:`, ...words.map((word, i) => `${mapPad}${word}: ${i + 1}`)] };
    case 'blockScalar': {
      const header = pick(random, ['|', '|-', '>', '>-']);
      return { key, kind: 'blockScalar', lines: [`${keyText}: ${header}`, ...words.map((word) => `${mapPad}${word} line`)] };
    }
    case 'long':
      return { key, kind: 'scalar', lines: [`${keyText}: ${'long plain words '.repeat(6)}${index}${comment}`] };
    default: {
      const [text] = pick(random, SCALARS);
      return { key, kind: 'scalar', lines: [`${keyText}:${text === '' ? '' : ' '}${text}${comment}`] };
    }
  }
}

function entryLines(seqPad: string, word: string, index: number, random: () => number): string[] {
  const lines = [`${seqPad}- name: ${word}`, `${seqPad}  desc: ${word} does ${index} damage`];
  if (random() < 0.3) lines.push(`${seqPad}  range: ${5 * (index + 1)}`);
  return lines;
}

/** Turns the first scalar entry into an anchor and the last into an alias of it; neither is patched. */
function addAnchorPair(entries: NoteEntry[]): void {
  const first = entries[0];
  const last = entries[entries.length - 1];
  if (!first || !last) return;
  first.kind = 'frozen';
  first.lines = [`${first.key}: &shared anchored value`];
  last.kind = 'frozen';
  last.lines = [`${last.key}: *shared`];
}

function randomBody(random: () => number, eol: string): string {
  const lines = ['Body text', '---', '...', 'hp: 99', '', '# Heading', '```atlas-statblock', '```', '  indented ---'];
  const count = int(random, 5);
  const body = Array.from({ length: count }, () => pick(random, lines)).join(eol);
  return count > 0 && random() < 0.7 ? body + eol : body;
}

function shuffled<T>(random: () => number, items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = int(random, index + 1);
    const swap = copy[index] as T;
    copy[index] = copy[other] as T;
    copy[other] = swap;
  }
  return copy;
}
