import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { conventionConfigs } from '../../scripts/eslint/atlasPlugin.mjs';
import { formsOf, isRestating, sentenceWords, STOP_WORDS, wordsOfName } from '../../scripts/eslint/restatingWords.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT_FILES = ['**/*.{ts,tsx}'];
const RULE = 'atlas/restating-comments';

const linter = new Linter({ cwd: ROOT });
const config: Linter.Config[] = [
  { files: SCRIPT_FILES, languageOptions: { parser: tseslint.parser } },
  ...conventionConfigs(SCRIPT_FILES).filter((block) => block.name === RULE),
];

function fixed(code: string): string {
  return linter.verifyAndFix(code, config, { filename: join(ROOT, 'src/app/example.ts') }).output;
}

describe('the words of a name', () => {
  it.each([
    ['tokenId', ['token', 'id']],
    ['TokenId', ['token', 'id']],
    ['token_id', ['token', 'id']],
    ['TOKEN_ID', ['token', 'id']],
    ['HTMLElement', ['html', 'element']],
    ['getUIOverlay', ['get', 'ui', 'overlay']],
    ['maxHP', ['max', 'hp']],
    ['point2d', ['point', '2', 'd']],
    ['#private', ['private']],
    ['rule-book', ['rule', 'book']],
  ])('%s', (name, words) => {
    expect(wordsOfName(name)).toEqual(words);
  });
});

describe('the forms of a word', () => {
  const same = (a: string, b: string): boolean => formsOf(a).some((form) => formsOf(b).includes(form));

  it.each([
    ['tokens', 'token'],
    ['Boxes', 'box'],
    ['caches', 'cache'],
    ['entries', 'entry'],
    ['classes', 'class'],
    ['creates', 'create'],
    ['creating', 'create'],
    ['created', 'create'],
    ['dragging', 'drag'],
    ['resizing', 'resize'],
    ['sorted', 'sort'],
    ['identifier', 'id'],
    ['identifiers', 'ids'],
    ['number', 'num'],
    ['configuration', 'config'],
    ['properties', 'props'],
    ['reference', 'ref'],
    ['function', 'fn'],
    ['callback', 'cb'],
    ['element', 'el'],
    ['positions', 'pos'],
    ['index', 'idx'],
    ['maximum', 'max'],
    ['minimum', 'min'],
  ])('%s is %s', (a, b) => {
    expect(same(a, b)).toBe(true);
  });

  it.each([
    ['not', 'note'],
    ['not', 'notes'],
    ['not', 'noted'],
    ['use', 'us'],
    ['class', 'clas'],
    ['status', 'statu'],
    ['hidden', 'hide'],
    ['string', 'str'],
    ['token', 'tokenize'],
  ])('%s is not %s', (a, b) => {
    expect(same(a, b)).toBe(false);
  });
});

describe('the words of a comment', () => {
  it('are those of one plain sentence', () => {
    expect(sentenceWords(' The token\n   id. ')).toEqual(['the', 'token', 'id']);
    expect(sentenceWords("A new level's id")).toEqual(['a', 'new', 'level', 'id']);
    expect(sentenceWords('Read-only token id.')).toEqual(['read', 'only', 'token', 'id']);
  });

  it.each([
    ['a tag', '@deprecated The token id.'],
    ['code', 'The token id, `token_1`.'],
    ['a call', 'The token id (unique).'],
    ['a number', 'The first 2 token ids.'],
    ['a link', 'The token id: https://example.org'],
    ['a second sentence', 'The token id. Unique.'],
    ['a colon', 'Token: the id.'],
    ['a rule of dashes', '── Token Id ──'],
    ['a single word', 'Token.'],
    ['more than eight words', 'The id of the token of the map of the scene.'],
    ['nothing', '   '],
  ])('are none for %s', (_what, text) => {
    expect(sentenceWords(text)).toBeNull();
  });
});

describe('a comment that only repeats its name', () => {
  it.each([
    ['The token id.', 'tokenId'],
    ['The identifier of the tokens', 'tokenIds'],
    ['Get the renderer service', 'getRendererService'],
    ['Check if a path is absolute', 'isAbsolutePath'],
    ['Rooms per loop.', 'ROOMS_PER_LOOP'],
    ["The GM's colour.", 'GM_COLOUR'],
    ['Check if currently resizing', 'isCurrentlyResizing'],
    ['Camera state', 'camera'],
    ['Return current options', 'getOptions'],
    ['The maximum number of tokens.', 'maxTokenNum'],
  ])('%s on %s', (text, name) => {
    expect(isRestating(text, name)).toBe(true);
  });

  it.each([
    ['a unit', 'The token size in cells.', 'tokenSize'],
    ['an adjective', 'The hidden token id.', 'tokenId'],
    ['a negation', 'Not the token id.', 'tokenId'],
    ['a limit', 'Only the token id.', 'tokenId'],
    ['a direction', 'Clips to the floors.', 'clipFloors'],
    ['whose it is', 'The map is loading.', 'loading'],
    ['a pronoun', 'Its token id.', 'tokenId'],
    ['which one', 'The new token position.', 'tokenPosition'],
    ['a kind of thing', 'The token kind.', 'token'],
    ['a verb the name lacks', 'Sorts the token ids.', 'tokenIds'],
    ['no word of the name', 'The value.', 'amount'],
    ['a label', 'layout', 'layout'],
  ])('is kept for %s', (_what, text, name) => {
    expect(isRestating(text, name)).toBe(false);
  });

  it('counts no word of the game as empty', () => {
    for (const word of ['map', 'item', 'field', 'list', 'kind', 'type', 'handle', 'new', 'to', 'in', 'from', 'its', 'not', 'only']) expect(STOP_WORDS.has(word), word).toBe(false);
  });
});

describe('the fix', () => {
  it('removes a comment with its line', () => {
    expect(fixed('export interface Token {\n  /** The token id. */\n  tokenId: string;\n}\n')).toBe('export interface Token {\n  tokenId: string;\n}\n');
    expect(fixed('export interface View {\n  selectedIds: string[];\n\n  // Drag state  \n  isDragging: boolean;\n}\n')).toBe('export interface View {\n  selectedIds: string[];\n\n  isDragging: boolean;\n}\n');
  });

  it('removes every line of a block', () => {
    expect(fixed('export class Grid {\n  size = 1;\n\n  /**\n   * Set grid scale\n   */\n  setGridScale(scale: number): void {\n    this.size = scale;\n  }\n}\n'))
      .toBe('export class Grid {\n  size = 1;\n\n  setGridScale(scale: number): void {\n    this.size = scale;\n  }\n}\n');
  });

  it('keeps the line of a declaration that shares it', () => {
    expect(fixed('export const settings = {\n  /** The token ids */ tokenIds: [],\n};\n')).toBe('export const settings = {\n  tokenIds: [],\n};\n');
  });

  it('keeps the line ends of the file', () => {
    expect(fixed('export interface Token {\r\n  /** The token id. */\r\n  tokenId: string;\r\n}\r\n')).toBe('export interface Token {\r\n  tokenId: string;\r\n}\r\n');
  });

  it('removes neighbours in one pass', () => {
    expect(fixed('export interface Token {\n  /** The token id. */\n  tokenId: string;\n  /** The token name. */\n  tokenName: string;\n}\n')).toBe('export interface Token {\n  tokenId: string;\n  tokenName: string;\n}\n');
  });
});
