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
    ['Tokens', 'tokens'],
    ['created', 'create'],
    ['sorted', 'sort'],
    ['dragged', 'drag'],
    ['identifier', 'id'],
    ['number', 'num'],
    ['configuration', 'config'],
    ['function', 'fn'],
    ['callback', 'cb'],
    ['element', 'el'],
    ['position', 'pos'],
    ['index', 'idx'],
    ['maximum', 'max'],
    ['minimum', 'min'],
  ])('%s is %s', (a, b) => {
    expect(same(a, b)).toBe(true);
  });

  it.each([
    ['not', 'note'],
    ['not', 'noted'],
    ['use', 'us'],
    ['hidden', 'hide'],
    ['string', 'str'],
    ['token', 'tokenize'],
    // A plural says there are several, in either direction.
    ['tokens', 'token'],
    ['ids', 'id'],
    ['boxes', 'box'],
    ['entries', 'entry'],
    ['classes', 'class'],
    ['creates', 'create'],
    ['identifiers', 'id'],
    // A word in `ing` may be a thing of its own.
    ['building', 'build'],
    ['lighting', 'lights'],
    ['lighting', 'light'],
    ['dragging', 'drag'],
    ['creating', 'create'],
    // A short spelling that is a word of its own.
    ['reference', 'ref'],
    ['property', 'prop'],
    ['properties', 'props'],
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
    ['The identifier of the token', 'tokenId'],
    ['The token ids.', 'tokenIds'],
    ['Get the renderer service', 'getRendererService'],
    ['Whether a path is absolute', 'isAbsolutePath'],
    ['Rooms per loop.', 'ROOMS_PER_LOOP'],
    ["The GM's colour.", 'GM_COLOUR'],
    ['Check whether currently resizing', 'isCurrentlyResizing'],
    ['Return the options', 'getOptions'],
    ['The maximum number of tokens.', 'maxTokensNum'],
    ['The sorted token ids.', 'sortTokenIds'],
  ])('%s on %s', (text, name) => {
    expect(isRestating(text, name)).toBe(true);
  });

  // Each was deleted by the rule once and said something its name does not.
  it.each([
    ['The class of the token.', 'token'],
    ['Min or max.', 'minMax'],
    ['Max of the min values.', 'minMax'],
    ['Returns the token if hidden.', 'hiddenToken'],
    ['The building id.', 'buildId'],
    ['The scene lighting.', 'sceneLights'],
    ['Reference token.', 'tokenRef'],
    ['Property tokens.', 'propTokens'],
    ['The token ids.', 'tokenId'],
    ['The token id.', 'tokenIds'],
    ['The ids of the tokens', 'tokenIds'],
    ['Camera state', 'camera'],
    ['Drag state', 'isDragging'],
    ['Return current options', 'getOptions'],
    ['Check if a path is absolute', 'isAbsolutePath'],
    ['Token and scene.', 'tokenScene'],
  ])('%s is kept on %s', (text, name) => {
    expect(isRestating(text, name)).toBe(false);
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

  it('counts no word as empty that says how names relate, which one is meant or how many', () => {
    for (const word of ['class', 'state', 'if', 'or', 'and', 'current', 'values', 'property']) expect(STOP_WORDS.has(word), word).toBe(false);
  });
});

describe('a comment that may name a group', () => {
  const kept = (code: string): void => expect(fixed(code)).toBe(code);

  it('is kept as a JSDoc block above members without one', () => {
    kept('export const view = {\n  /** Token settings */\n  tokenSettings: {},\n  tokenSize: 1,\n};\n');
    kept('export interface View {\n  /** Token settings */\n  tokenSettings: object;\n\n  tokenSize: number;\n}\n');
    kept('export const first = 1;\n/** Token sizes */\nexport const TOKEN_SIZES = [1, 2];\nexport const TOKEN_GAP = 4;\n');
  });

  it('is kept as a line above a member whose comment is a block, and as a block above one whose comment is a line', () => {
    kept('export interface View {\n  // Token settings\n  tokenSettings: object;\n  /** In cells. */\n  tokenSize: number;\n}\n');
    kept('export interface View {\n  /** Token settings */\n  tokenSettings: object;\n  // In cells.\n  tokenSize: number;\n}\n');
  });

  it('is kept as a line above members without a comment', () => {
    kept('export interface View {\n  // Token settings\n  tokenSettings: object;\n  tokenSize: number;\n}\n');
  });

  it('is removed where the next member has a comment of its kind, or none follows', () => {
    expect(fixed('export interface View {\n  // Token settings\n  tokenSettings: object;\n  // In cells.\n  tokenSize: number;\n}\n')).toBe('export interface View {\n  tokenSettings: object;\n  // In cells.\n  tokenSize: number;\n}\n');
    expect(fixed('export interface View {\n  tokenSize: number;\n  /** Token settings */\n  tokenSettings: object;\n}\n')).toBe('export interface View {\n  tokenSize: number;\n  tokenSettings: object;\n}\n');
  });
});

describe('the fix', () => {
  it('removes a comment with its line', () => {
    expect(fixed('export interface Token {\n  /** The token id. */\n  tokenId: string;\n}\n')).toBe('export interface Token {\n  tokenId: string;\n}\n');
    expect(fixed('export interface View {\n  isDragging: boolean;\n\n  // Selected ids  \n  selectedIds: string[];\n}\n')).toBe('export interface View {\n  isDragging: boolean;\n\n  selectedIds: string[];\n}\n');
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
